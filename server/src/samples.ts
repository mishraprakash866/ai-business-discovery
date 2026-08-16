export interface SampleInput {
  type: "file" | "text" | "url";
  name: string;
  contentType: string;
  content: string;
}

export const SAMPLE_PACK: SampleInput[] = [
  {
    type: "file",
    name: "meeting-transcript-1.txt",
    contentType: "text/plain",
    content: `MEETING TRANSCRIPT - Discovery call #1
Participants: Arjun (Ops Manager, BrightCart), Sara (Warehouse Lead), external consultant
Date: June 3

Arjun: Our biggest headache is order processing. We get orders from WhatsApp, phone calls, email, and sometimes walk-ins at the warehouse. There is no single place where all orders live.

Sara: I spend 3-4 hours every evening typing orders from WhatsApp chats into an Excel sheet. If a customer calls to change something, I have to find their row and update it. Sometimes I miss it and we ship the wrong item.

Arjun: We have 6 salespeople. Each one keeps their own notebook or phone list of orders. The warehouse team has no idea what is coming in until the orders are entered, which is usually next morning.

Sara: Last month we shipped 47 wrong orders and got 12 chargebacks on payment gateway. Customers complain we take 2 days to confirm their order.

Arjun: We want one system where a salesperson can record an order in under a minute, and the warehouse sees it instantly. Also customers should be able to check order status without calling us.

Sara: Inventory is manual too. We count stock on paper every Friday. Sometimes we accept an order we cannot fulfil.

Arjun: Budget is small, we are a 40 person company. Something simple, maybe 5-6 lakh rupees, that works on mobile and is easy to train people on.

Next step: consultant to review the WhatsApp order chat and the current process document before the next call.`,
  },
];
