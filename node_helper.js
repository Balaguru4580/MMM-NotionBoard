const NodeHelper = require("node_helper");
const fetch = require("node-fetch");

function getStatusName(prop) {
  if (!prop) return "No Status";

  switch (prop.type) {
    case "status":
      return prop.status?.name || "No Status";
    case "select":
      return prop.select?.name || "No Status";
    case "multi_select":
      return prop.multi_select?.map(opt => opt.name).join(", ") || "No Status";
    default:
      return "No Status";
  }
}


module.exports = NodeHelper.create({
  socketNotificationReceived: async function (notification, payload) {
    if (notification === "NOTION_REQUEST") {
      const { secret, databaseId, showStatuses } = payload;

      try {
        const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${secret}`,
            "Notion-Version": "2022-06-28",
            "Content-Type": "application/json"
          }
        });

        const data = await res.json();

        const grouped = {};
        if (data.results) {
          data.results.forEach(page => {
            const nameProp = page.properties.Name?.title?.[0]?.plain_text || "Untitled";
            // const statusProp = page.properties.Status?.select?.name || "No Status";
              const statusProp = getStatusName(page.properties.Status);

            // Filter: only include if in showStatuses (or show all if not set)
            if (!showStatuses || showStatuses.includes(statusProp)) {
              if (!grouped[statusProp]) grouped[statusProp] = [];
              grouped[statusProp].push(nameProp);
            }
          });
        }

        this.sendSocketNotification("NOTION_DATA", grouped);
      } catch (e) {
        console.error("MMM-NotionBoard fetch error:", e);
      }
    }
  }
});
