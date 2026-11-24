const { test } = require("node:test")
const assert = require("node:assert/strict")
const { findMentions } = require("../dist/teams/notify")
const { inviteEmail, mentionEmail } = require("../dist/teams/email-templates")
const { ROLE_RANK } = require("../dist/auth/public.decorator")

const members = [
  { id: "a", name: "Arjun Kumar", email: "arjun.k@acme.com" },
  { id: "p", name: "Priya", email: "priya@acme.com" },
  { id: "m", name: "Madhu", email: "madhu@acme.com" },
]

test("mentions match first name, full name and email name", () => {
  assert.deepEqual(findMentions("@Arjun can you look?", members), ["a"])
  assert.deepEqual(findMentions("thanks @arjun.k and @priya!", members).sort(), ["a", "p"])
  assert.deepEqual(findMentions("@Madhu: done", members), ["m"])
  assert.deepEqual(findMentions("email me at madhu@acme.com", members), [])
  assert.deepEqual(findMentions("@Madhuri is not Madhu", members), [])
})

test("emails escape names and include the link", () => {
  const inv = inviteEmail({ inviter: "Eve <script>", workspace: "Acme", role: "member", url: "https://app/invite/x" })
  assert.match(inv.html, /Eve &lt;script&gt;/)
  assert.match(inv.text, /https:\/\/app\/invite\/x/)
  const men = mentionEmail({ actor: "Priya", bug: "BUG-4", title: "Pay", comment: "@Madhu look", url: "https://app/r" })
  assert.equal(men.subject, "Priya mentioned you on BUG-4")
})

test("role order", () => {
  assert.ok(ROLE_RANK.owner > ROLE_RANK.admin && ROLE_RANK.admin > ROLE_RANK.member && ROLE_RANK.member > ROLE_RANK.guest)
})
