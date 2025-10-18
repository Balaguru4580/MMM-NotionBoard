Module.register("MMM-NotionBoard", {
  defaults: {
    secret: "",
    databaseId: "",
    updateInterval: 60000
  },

  start: function () {
    this.tasks = {};
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
      this.tasks = payload;
      this.updateDom();
    }
  },

  getDom: function () {
    const wrapper = document.createElement("div");

    if (!this.tasks || Object.keys(this.tasks).length === 0) {
      wrapper.innerHTML = "Loading Notion tasks…";
      return wrapper;
    }

    if (this.config.title) {
      const titleEl = document.createElement("h1");
      titleEl.innerText = this.config.title;
      titleEl.style.marginBottom = "5px";
      titleEl.style.textAlign = "start";
      wrapper.appendChild(titleEl);
    }

    const container = document.createElement("div");
    container.style.display = "flex";
    container.style.gap = "10px";

    for (const [status, items] of Object.entries(this.tasks)) {
      const col = document.createElement("div");
      col.style.flex = "1";
      col.style.minWidth = "150px";

      const header = document.createElement("h2");
      header.innerText = status;
      col.appendChild(header);

      items.forEach(item => {
        const div = document.createElement("div");
        div.innerText = item;
        div.style.marginBottom = "8px";
        col.appendChild(div);
      });

      container.appendChild(col);
    }

    wrapper.appendChild(container);
    return wrapper;
  }
});
