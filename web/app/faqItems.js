import Link from "next/link";

// The FAQ, shared by How It Works (#faq, all of them) and the landing page's last section (the first few). [question, answer].
export const FAQ = [
  ["Is this for betting?", <>No. Everything here is for fantasy football roster decisions, and it isn&apos;t intended for gambling or wagering of any kind. See the <Link href="/disclaimer">Disclaimer</Link>.</>],
  ["What scoring do the projections use?", "Full PPR (1 point per catch). On My Team, live points use your own league's scoring, straight from Sleeper."],
  ["Which fantasy platforms work?", "Sleeper today. Look up any Sleeper username without an account; save leagues with a free account."],
  ["Do you change anything in my Sleeper account?", "Never. We only read your public leagues, rosters and matchups. Lineup changes are always made by you, in Sleeper."],
  ["What's free and what's paid?", <>Stargazer is free: one league live on the Game Board with lineup alerts, the top 50 weekly rankings, the top 20 of the Dynasty Board and the top 10 season simulations, and a new account gets 14 days of Explorer when it signs up (one free trial per Sleeper account). Explorer runs up to 10 leagues live, with start / sit swaps, playoff odds and every player in the rankings and the Dynasty Board. Singularity adds every season simulation, the full Observatory and unlimited leagues. <Link href="/#pricing">Compare plans</Link>.</>],
  ["Can I switch plans?", "Yes. Account, then Manage Billing, then change your plan. The difference is prorated automatically."],
  ["How do I cancel?", "Account, then Manage Billing, then Cancel. You keep everything until the end of the period you paid for and aren't charged again."],
  ["Do you offer refunds?", <>Yes, within 14 days of a payment. <Link href="/contact">Contact us</Link> and we&apos;ll take care of it.</>],
  ["Why did a projection change in the middle of the week?", "Projections publish Tuesday and refresh Thursday afternoon and Sunday morning for injury news. A player ruled out drops to 0."],
  ["Why does a player show 0?", "Either he's ruled out (an injury designation, or no projection anywhere because he won't play) or his team is on its BYE. The site always says which."],
  ["How does Refer a friend work?", <>Your link is on your <Link href="/account">Account</Link> page. A friend who signs up through it gets 20% off their first payment. Once they have been subscribed for 14 days (past the refund window), you get a free month of your plan as account credit, taken off your next bill automatically (if you&apos;re on the free plan, it waits for when you subscribe). First-time subscribers only, never your own second account or card, up to 12 rewards a year.</>],
  ["How do I delete my account and data?", "Account, then Delete account. It cancels any subscription immediately and removes your login, saved leagues and settings."],
  ["Something looks wrong. Who do I tell?", <><Link href="/contact">Contact us</Link>. Errors on the site are also recorded automatically so we can fix them.</>],
];
