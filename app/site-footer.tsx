import { Footer } from "animal-island-ui";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <p>家庭星币成长站 · 只记录帮助习惯成长所需的最少信息</p>
      <p>
        界面组件来自{" "}
        <a href="https://github.com/kiwinww/animal-island-ui" rel="noreferrer" target="_blank">
          animal-island-ui
        </a>{" "}
        · CC BY-NC 4.0 · 仅限家庭非商业使用
      </p>
      <Footer type="tree" />
    </footer>
  );
}
