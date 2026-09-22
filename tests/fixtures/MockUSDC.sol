// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
interface ISignatureWallet { function isValidSignature(bytes32,bytes calldata) external view returns(bytes4); }
/// @dev Test double for code-routing EIP-3009. Not Circle's deployed implementation.
contract MockUSDC {
    mapping(address=>uint256) public balanceOf;
    mapping(address=>mapping(bytes32=>bool)) public authorizationState;
    event Transfer(address indexed from,address indexed to,uint256 value);
    event AuthorizationUsed(address indexed authorizer,bytes32 indexed nonce);
    function mint(address to,uint256 value) external { balanceOf[to]+=value; }
    function transferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,bytes calldata signature) external {
        require(block.timestamp>validAfter && block.timestamp<validBefore,"time");
        require(!authorizationState[from][nonce],"used nonce");
        bytes32 domain=keccak256(abi.encode(keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),keccak256("USDC"),keccak256("2"),block.chainid,address(this)));
        bytes32 digest=keccak256(abi.encodePacked(hex"1901",domain,keccak256(abi.encode(keccak256("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"),from,to,value,validAfter,validBefore,nonce))));
        require(ISignatureWallet(from).isValidSignature(digest,signature)==0x1626ba7e,"signature");
        authorizationState[from][nonce]=true;balanceOf[from]-=value;balanceOf[to]+=value;
        emit AuthorizationUsed(from,nonce);emit Transfer(from,to,value);
    }
}
