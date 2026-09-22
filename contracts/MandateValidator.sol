// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IReplaySafeWallet {
    function replaySafeHash(bytes32 hash) external view returns (bytes32);
}

/// @notice Testnet-only Coinbase Smart Wallet contract owner for reserved USDC payments.
/// @dev No arbitrary execution or signature approval. Reservations are never refunded.
contract MandateValidator {
    address public constant TOKEN = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    address public immutable wallet;
    bytes32 private constant TYPEHASH = keccak256("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)");
    bytes32 public immutable tokenDomain;
    struct Grant {
        address agent;
        address recipient;
        uint256 total;
        uint256 perCall;
        uint256 reserved;
        uint256 expiry;
        bytes32 workflow;
        bool revoked;
    }
    struct Authorization {
        address from;
        address to;
        uint256 value;
        uint256 validAfter;
        uint256 validBefore;
        bytes32 nonce;
    }
    struct Reservation { bytes32 grantId; uint256 validAfter; uint256 validBefore; }
    mapping(bytes32 => Grant) public grants;
    mapping(bytes32 => Reservation) public reservations;
    mapping(bytes32 => bool) public usedNonce;
    event Granted(bytes32 indexed grantId, bytes32 indexed workflow, address agent);
    event Reserved(bytes32 indexed grantId, bytes32 indexed digest, bytes32 nonce, uint256 amount);
    event Revoked(bytes32 indexed grantId);

    constructor(address wallet_) {
        require(block.chainid == 84532 && wallet_.code.length != 0, "testnet deployed wallet required");
        wallet = wallet_;
        tokenDomain = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("USDC"), keccak256("2"), block.chainid, TOKEN
        ));
    }

    function grant(bytes32 id, address agent, address recipient, uint256 total, uint256 perCall, uint256 expiry, bytes32 workflow) external {
        require(msg.sender == wallet, "wallet only");
        require(id != bytes32(0) && grants[id].agent == address(0), "grant exists");
        require(agent != address(0) && recipient != address(0) && recipient != wallet, "invalid address");
        require(total > 0 && total <= 1e6 && perCall > 0 && perCall <= total, "invalid budget");
        require(expiry > block.timestamp && expiry <= block.timestamp + 3600, "invalid expiry");
        require(workflow != bytes32(0), "workflow required");
        grants[id] = Grant(agent, recipient, total, perCall, 0, expiry, workflow, false);
        emit Granted(id, workflow, agent);
    }

    function revoke(bytes32 id) external {
        require(msg.sender == wallet || msg.sender == grants[id].agent, "unauthorized");
        grants[id].revoked = true;
        emit Revoked(id);
    }

    function authorizationDigest(Authorization calldata a) public view returns (bytes32) {
        return keccak256(abi.encodePacked(hex"1901", tokenDomain,
            keccak256(abi.encode(TYPEHASH, a.from, a.to, a.value, a.validAfter, a.validBefore, a.nonce))));
    }

    function reserve(bytes32 id, Authorization calldata a) external returns (bytes32 digest) {
        Grant storage g = grants[id];
        require(msg.sender == g.agent && !g.revoked && block.timestamp < g.expiry, "inactive grant");
        require(a.from == wallet && a.to == g.recipient, "wrong payment parties");
        require(a.value > 0 && a.value <= g.perCall && g.reserved + a.value <= g.total, "budget exceeded");
        require(a.validAfter < block.timestamp && a.validBefore > block.timestamp && a.validBefore <= g.expiry
            && a.validBefore <= block.timestamp + 300, "invalid authorization time");
        require(!usedNonce[a.nonce], "nonce already reserved");
        digest = IReplaySafeWallet(wallet).replaySafeHash(authorizationDigest(a));
        usedNonce[a.nonce] = true;
        g.reserved += a.value;
        reservations[digest] = Reservation(id, a.validAfter, a.validBefore);
        emit Reserved(id, digest, a.nonce, a.value);
    }

    /// @dev Require the session signature as well as a reservation, so public reservation
    /// calldata alone cannot be used to front-run the merchant's settlement.
    function isValidSignature(bytes32 digest, bytes calldata signature) external view returns (bytes4) {
        Reservation memory r = reservations[digest];
        Grant memory g = grants[r.grantId];
        if (msg.sender == wallet && r.grantId != bytes32(0) && !g.revoked && block.timestamp < g.expiry
            && block.timestamp > r.validAfter && block.timestamp < r.validBefore && signature.length == 65) {
            bytes32 sr; bytes32 ss; uint8 v;
            assembly ("memory-safe") {
                sr := calldataload(signature.offset)
                ss := calldataload(add(signature.offset, 32))
                v := byte(0, calldataload(add(signature.offset, 64)))
            }
            if ((v == 27 || v == 28) && uint256(ss) <= 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0
                && ecrecover(digest, v, sr, ss) == g.agent) return 0x1626ba7e;
        }
        return 0xffffffff;
    }
}
