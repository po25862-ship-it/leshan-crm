import React from "react";
import Needs from "./Needs";

export default function BuyerNeeds({ contactId, contactName }) {
  return <Needs key={contactId} embedded contactId={contactId} contactName={contactName} />;
}
