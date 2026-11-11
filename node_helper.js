const NodeHelper = require("node_helper");

const NOTION_VERSION = "2025-09-03";
const REQUEST_TIMEOUT_MS = 10000;
const PAGE_SIZE = 100;
const MAX_PAGES = 10;

class NotionError extends Error {
    constructor(message, status, code) {
        super(message);
        this.name = "NotionError";
        this.status = status;
        this.code = code;
    }
}

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

// One place that talks to Notion, so every failure carries a status and a readable reason.
async function notionFetch(url, secret, body) {
    const options = {
        method: body ? "POST" : "GET",
        headers: {
            "Authorization": `Bearer ${secret}`,
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json"
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    };
    if (body) options.body = JSON.stringify(body);

    let res;
    try {
        res = await fetch(url, options);
    } catch (err) {
        if (err.name === "TimeoutError" || err.name === "AbortError") {
            throw new NotionError(
                `Notion did not answer within ${REQUEST_TIMEOUT_MS / 1000}s`,
                null,
                "timeout"
            );
        }
        const reason = err.cause?.message || err.message || "network error";
        throw new NotionError(`Could not reach Notion: ${reason}`, null, "network");
    }

    let data;
    try {
        data = await res.json();
    } catch (err) {
        throw new NotionError(
            `Notion returned HTTP ${res.status} with an unreadable body`,
            res.status,
            "bad_body"
        );
    }

    if (!res.ok) {
        const msg = data && data.message ? data.message : res.statusText || "request failed";
        throw new NotionError(`Notion rejected the request (${res.status}: ${msg})`, res.status, data && data.code);
    }

    return data;
}

async function getDataSources(databaseId, secret) {
    const data = await notionFetch(`https://api.notion.com/v1/databases/${databaseId}`, secret);
    const sources = data && data.data_sources;

    if (!Array.isArray(sources) || sources.length === 0) {
        throw new NotionError(
            "Notion returned no data sources for this database (check the integration is shared with it)",
            null,
            "no_data_sources"
        );
    }
    if (!sources[0] || !sources[0].id) {
        throw new NotionError("Notion returned a data source with no id", null, "no_data_source_id");
    }
    return sources;
}

module.exports = NodeHelper.create({
    start: function () {
        console.log("Starting node_helper for: " + this.name);
    },

    socketNotificationReceived: async function (notification, payload) {
        if (notification !== "NOTION_REQUEST") return;

        const { secret, databaseId, showStatuses } = payload || {};

        try {
            if (!secret) throw new NotionError("No Notion token set in config.js", null, "no_secret");
            if (!databaseId) throw new NotionError("No databaseId set in config.js", null, "no_database_id");

            const dataSources = await getDataSources(databaseId, secret);
            const dataSourceId = dataSources[0].id;
            const queryUrl = `https://api.notion.com/v1/data_sources/${dataSourceId}/query`;

            const first = await notionFetch(queryUrl, secret, { page_size: PAGE_SIZE });
            let allResults = Array.isArray(first.results) ? first.results : [];
            let hasMore = first.has_more;
            let nextCursor = first.next_cursor;
            let pages = 1;
            let truncated = false;

            while (hasMore && nextCursor) {
                if (pages >= MAX_PAGES) {
                    truncated = true;
                    console.warn(`MMM-NotionBoard: stopped after ${MAX_PAGES} pages (${allResults.length} cards), results are incomplete`);
                    break;
                }
                const next = await notionFetch(queryUrl, secret, {
                    page_size: PAGE_SIZE,
                    start_cursor: nextCursor
                });
                allResults = allResults.concat(Array.isArray(next.results) ? next.results : []);
                hasMore = next.has_more;
                nextCursor = next.next_cursor;
                pages += 1;
            }

            const grouped = {};
            allResults.forEach(page => {
                const nameProp = page.properties?.Name?.title?.[0]?.plain_text || "Untitled";
                const statusProp = getStatusName(page.properties?.Status);

                if (!showStatuses || showStatuses.includes(statusProp)) {
                    if (!grouped[statusProp]) grouped[statusProp] = [];
                    grouped[statusProp].push(nameProp);
                }
            });

            this.sendSocketNotification("NOTION_DATA", {
                tasks: grouped,
                count: allResults.length,
                truncated: truncated,
                at: Date.now()
            });
        } catch (error) {
            const message = error instanceof NotionError
                ? error.message
                : `Unexpected error: ${String(error && error.message ? error.message : error)}`;
            console.error("MMM-NotionBoard fetch error:", error);
            this.sendSocketNotification("NOTION_ERROR", { message: message, at: Date.now() });
        }
    }
});
