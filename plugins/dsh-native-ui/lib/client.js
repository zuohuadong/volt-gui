window.__ModuleLoader__.load({
  id: "@voltui/dsh-native-ui",
  factory(require) {
    const React = require("react");
    const slots = require("@deepseek-ai/dsh-client-ui-slots");
    const renderer = require("@deepseek-ai/dsh-client-ui-renderer");
    const h = React.createElement;
    void slots;
    void renderer;

    function FooterAction({ wide, openNativeUi }) {
      return h(
        "button",
        {
          type: "button",
          title: "Native UI",
          "aria-label": "Native UI",
          "data-voltui-native-ui": "footer",
          onClick: openNativeUi,
        },
        wide ? "Native UI" : "N",
      );
    }

    function SettingsTab() {
      return h(
        "section",
        {
          "data-voltui-native-ui": "settings",
          "aria-label": "Native UI",
        },
        h("h2", null, "Native UI"),
        h("p", null, "This page is registered through the official DSH client UI slots."),
      );
    }

    function SessionMenuItem({ useMenuOpenState, openNativeUi }) {
      const [, setMenuOpen] = useMenuOpenState();
      return h(
        "button",
        {
          type: "button",
          role: "menuitem",
          "data-voltui-native-ui": "session-menu",
          onClick: () => {
            setMenuOpen(false);
            openNativeUi();
          },
        },
        "Native UI",
      );
    }

    return {
      inject: ["slots"],
      apply(ctx) {
        const openNativeUi = () => {
          ctx.get("layout")?.selectPanel("plugins");
          ctx.get("pluginNavigation")?.openBundle("@voltui/dsh-native-ui");
        };
        const injectNavigation = () => ({ openNativeUi });
        ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register(
          {
            name: "sidebar.footer.action",
            id: "voltui-native-ui",
            order: 900,
            label: "Native UI",
            inject: injectNavigation,
          },
          FooterAction,
        ));
        ctx.slots.inject("settings.plugins.tab", () => ctx.slots.register(
          {
            name: "settings.plugins.tab",
            id: "voltui-native-ui",
            order: 900,
            label: "Native UI",
            inject: injectNavigation,
          },
          SettingsTab,
        ));
        ctx.slots.inject("sidebar.workspaces.session.menu.item", () => ctx.slots.register(
          {
            name: "sidebar.workspaces.session.menu.item",
            id: "voltui-native-ui",
            order: 900,
            inject: injectNavigation,
          },
          SessionMenuItem,
        ));
      },
    };
  },
});
