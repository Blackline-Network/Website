BLACKLINE dispute system + support panel

In 🗃️・support, a commissioner can run:
  /dispute panel
This posts the persistent Dispute Center panel. Buttons provide submission instructions and recent decision history.

Coach submissions:
  /dispute submit dynasty:<name> type:<type> details:<what happened> screenshot:<attachment>
  /dispute history [dynasty:<name>]

Submissions are posted to 🗃️・support with screenshot evidence and commissioner decision buttons:
Force Win, Record Disconnect, Approve Restart, Deny.
Decisions are stored in data/disputes.json and the case post is edited to show the final ruling. Coaches in the dynasty receive a DM notice when a ruling is made (if DMs are open).

Permissions: Discord Administrators and roles listed in DYNASTY_MANAGER_ROLES (defaults: Commissioner,Dynasty Manager,League Manager) can publish the panel and rule on disputes.

Note: Force Win is recorded as an official dispute ruling in the history log; it does not change an external game's score automatically.

Keep existing .env and data/dynasties.json. Bot needs view/send messages and embed links in 🗃️・support. Restart using node index.js. Run /dispute panel once to post the panel.
