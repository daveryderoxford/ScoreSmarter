import test from "node:test";
import * as assert from "node:assert/strict";
import { clubApprovedEmail, registrationNotificationEmail, registrationReceivedEmail } from "./onboarding-emails.js";

const registration = {
  clubName: "West Bay SC",
  subdomain: "westbay",
  contactName: "Sam Secretary",
  contactEmail: "sec@westbay.org",
};

test("registrationReceivedEmail thanks the contact by first name, from support", () => {
  const email = registrationReceivedEmail(registration);
  assert.equal(email.from, "ScoreSmarter <support@scoresmarter.app>");
  assert.equal(email.to, "sec@westbay.org");
  assert.match(email.subject, /West Bay SC/);
  assert.match(email.text, /^Hello Sam,/);
});

test("registrationNotificationEmail goes to the given address and replies to the contact", () => {
  const email = registrationNotificationEmail(registration, "admin@scoresmarter.app");
  assert.equal(email.to, "admin@scoresmarter.app");
  assert.equal(email.replyTo, "sec@westbay.org");
  assert.match(email.text, /https:\/\/westbay\.ro\.scoresmarter\.app/);
});

test("clubApprovedEmail gives the approved club's address and the welcome link", () => {
  const link = "https://wbsc.ro.scoresmarter.app/auth/welcome?code=abc";
  const email = clubApprovedEmail(registration, "wbsc", "West Bay Sailing Club", link);
  assert.equal(email.from, "ScoreSmarter <support@scoresmarter.app>");
  assert.equal(email.to, "sec@westbay.org");
  assert.match(email.subject, /^West Bay Sailing Club is ready/);
  assert.match(email.text, /at https:\/\/wbsc\.ro\.scoresmarter\.app\n/);
  assert.match(email.text, /valid for 30 days/);
  assert.ok(email.text.includes(`\n${link}\n`));
});
