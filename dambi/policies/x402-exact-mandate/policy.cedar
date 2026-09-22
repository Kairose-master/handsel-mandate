@id("x402-exact-mandate")
@severity("deny")
@reason("The x402 authorization does not match the active Handsel mandate")
forbid(principal, action == Token::Action::"Eip3009TransferAuthorization", resource)
unless {
  context has custom &&
  context.owner == context.custom.mandate_owner &&
  context.recipient == context.custom.mandate_recipient &&
  context.amount == context.custom.mandate_amount
};
