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

test("clubApprovedEmail links to the approved club id, which may differ from the request", () => {
  const email = clubApprovedEmail(registration, "wbsc", "West Bay Sailing Club");
  assert.equal(email.from, "ScoreSmarter <support@scoresmarter.app>");
  assert.equal(email.to, "sec@westbay.org");
  assert.match(email.subject, /^West Bay Sailing Club is ready/);
  assert.match(email.text, /https:\/\/wbsc\.ro\.scoresmarter\.app/);
  assert.match(email.text, /\(sec@westbay\.org\)/);
});
