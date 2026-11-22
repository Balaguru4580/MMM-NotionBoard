Module.register("MMM-NotionBoard", {
    defaults: {
        secret: "",
        databaseId: "",
        updateInterval: 60000,
        showDebug: false,
        // Text colour per priority name. Anything not listed (Low, blank) gets
        // defaultTextColor, which is what "no priority" should look like.
        priorityColors: {
            High: "#9C4F4F",
            Medium: "#c8984bc4"
        },
        // Pale green with the same lightness as the High red, so all three tiers read
        // as one palette instead of one coloured card sitting in white text.
        defaultTextColor: "#4F9C4F"
    },

    start: function () {
        this.tasks = {};
        this.loaded = false;
        this.errorMessage = null;
        this.lastGoodAt = null;
        this.truncated = false;
        this.getData();
        setInterval(() => {
            this.getData();
        }, this.config.updateInterval);
    },

    getData: function () {
        this.sendSocketNotification("NOTION_REQUEST", {
            secret: this.config.secret,
            databaseId: this.config.databaseId,
            showStatuses: this.config.showStatuses || null
        });
    },

    socketNotificationReceived: function (notification, payload) {
        if (notification === "NOTION_DATA") {
            this.tasks = (payload && payload.tasks) || {};
            this.truncated = !!(payload && payload.truncated);
            this.loaded = true;
            this.errorMessage = null;
            this.lastGoodAt = (payload && payload.at) || Date.now();
            this.updateDom();
        } else if (notification === "NOTION_ERROR") {
            // Keep the last good columns on screen; say why they may be stale.
            this.errorMessage = (payload && payload.message) || "Unknown Notion error";
            this.updateDom();
        }
    },

    timeAgo: function (ms) {
        const mins = Math.floor((Date.now() - ms) / 60000);
        if (mins < 1) return "just now";
        if (mins === 1) return "1 min ago";
        return mins + " min ago";
    },

    priorityColor: function (priority) {
        const colors = this.config.priorityColors || {};
        const wanted = String(priority || "").toLowerCase();
        for (const name of Object.keys(colors)) {
            if (name.toLowerCase() === wanted && colors[name]) return colors[name];
        }
        // Low, blank, or an option nobody mapped: the neutral pale green.
        return this.config.defaultTextColor || null;
    },

    getDom: function () {
        const wrapper = document.createElement("div");

        if (this.config.showDebug) {
            const debugDiv = document.createElement("div");
            debugDiv.style.whiteSpace = "pre-wrap";
            debugDiv.style.fontFamily = "monospace";
            debugDiv.style.padding = "10px";
            debugDiv.style.background = "rgba(0, 0, 0, 0.6)";
            debugDiv.style.marginBottom = "10px";
            debugDiv.style.border = "1px solid #666";

            const debugInfo = {
                loaded: this.loaded,
                error: this.errorMessage,
                truncated: this.truncated,
                tasks: this.tasks,
                config: {
                    databaseId: this.config.databaseId
                }
            };

            debugDiv.innerText = JSON.stringify(debugInfo, null, 2);
            wrapper.appendChild(debugDiv);
        }

        if (this.config.title) {
            const titleEl = document.createElement("h1");
            titleEl.innerText = this.config.title;
            titleEl.style.marginBottom = "5px";
            titleEl.style.textAlign = "start";
            wrapper.appendChild(titleEl);
        }

        if (this.errorMessage) {
            const errEl = document.createElement("div");
            errEl.className = "notionboard-error small";
            errEl.style.marginBottom = "8px";
            errEl.style.padding = "4px 8px";
            errEl.style.borderLeft = "3px solid #f66";
            errEl.innerText = this.errorMessage;
            wrapper.appendChild(errEl);

            if (this.lastGoodAt) {
                const staleEl = document.createElement("div");
                staleEl.className = "notionboard-stale xsmall dimmed";
                staleEl.style.marginBottom = "8px";
                staleEl.innerText = "Showing data from " + this.timeAgo(this.lastGoodAt);
                wrapper.appendChild(staleEl);
            }
        }

        if (this.truncated) {
            const truncEl = document.createElement("div");
            truncEl.className = "notionboard-truncated xsmall dimmed";
            truncEl.style.marginBottom = "8px";
            truncEl.innerText = "Too many cards, list is incomplete.";
            wrapper.appendChild(truncEl);
        }

        if (!this.loaded) {
            if (!this.errorMessage) {
                wrapper.innerHTML += "Loading Notion tasks…";
            }
            return wrapper;
        }

        const container = document.createElement("div");
        container.style.display = "flex";
        container.style.gap = "10px";
        wrapper.appendChild(container);

        if (Object.keys(this.tasks).length === 0) {
            const emptyEl = document.createElement("div");
            emptyEl.innerText = "No tasks at the moment.";
            container.appendChild(emptyEl);
            return wrapper;
        }

        for (const [status, items] of Object.entries(this.tasks)) {
            const col = document.createElement("div");
            col.style.flex = "1";
            col.style.minWidth = "150px";
            const header = document.createElement("h2");
            header.innerText = status;
            col.appendChild(header);
            items.forEach(item => {
                // Cards arrive as {name, priority}; a bare string is tolerated so an old
                // helper half (or a stale payload) still renders instead of showing blanks.
                const name = typeof item === "string" ? item : (item && item.name) || "";
                const priority = typeof item === "string" ? "" : (item && item.priority) || "";
                const div = document.createElement("div");
                div.innerText = name;
                div.style.marginBottom = "8px";
                const color = this.priorityColor(priority);
                if (color) div.style.color = color;
                col.appendChild(div);
            });
            container.appendChild(col);
        }

        return wrapper;
    }
});
