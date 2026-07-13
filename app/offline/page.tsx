import { Card, Title } from "animal-island-ui";
import { SiteFooter } from "@/app/site-footer";

export default function OfflinePage() {
  return (
    <div className="offline-shell">
      <main className="center-page" id="main-content">
        <Card className="login-card" pattern="app-green">
          <p className="eyebrow">暂时离线</p>
          <Title color="app-green" size="large">连上网络再继续</Title>
          <p>为了保护家庭数据，离线时只显示这个应用外壳，不会展示任务、星币或管理内容。</p>
          <a className="download-button" href="/">重新连接</a>
        </Card>
      </main>
      <SiteFooter />
    </div>
  );
}
