"use client";

import { useState } from "react";
import { Button, Card, Form, Input, Select, Title } from "animal-island-ui";
import { Notification } from "@/lib/animal-notification";

const timezoneOptions = [
  { key: "Asia/Hong_Kong", label: "香港 / 北京时间" },
  { key: "Asia/Shanghai", label: "中国标准时间" },
  { key: "Asia/Taipei", label: "台北时间" },
  { key: "Asia/Singapore", label: "新加坡时间" }
];

export function SetupForm() {
  const [busy, setBusy] = useState(false);
  const [values, setValues] = useState({ familyName: "", nickname: "", timezone: "Asia/Hong_Kong", pin: "", bootstrapSecret: "" });

  async function submit() {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/setup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(values) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "初始化失败");
      Notification.success({ message: "家庭成长站已经准备好", description: "正在进入家长后台。" });
      window.location.href = "/admin";
    } catch (error) {
      Notification.error({ message: "初始化没有完成", description: error instanceof Error ? error.message : "请检查填写内容。" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="setup-page" id="main-content">
      <Card className="setup-card" color="default" pattern="app-green">
        <p className="eyebrow">第一次使用</p>
        <Title color="app-teal" size="large">建立你的家庭成长站</Title>
        <p className="lead">这里只需要昵称，不需要孩子的真实姓名、照片、学校或地址。</p>
        <Form layout="vertical" onFinish={submit}>
          <label className="field">
            <span>家庭名称</span>
            <Input required size="large" value={values.familyName} onChange={(event) => setValues({ ...values, familyName: event.target.value })} placeholder="例如：快乐小屋" />
          </label>
          <label className="field">
            <span>孩子昵称</span>
            <Input required size="large" value={values.nickname} onChange={(event) => setValues({ ...values, nickname: event.target.value })} placeholder="例如：小树苗" />
          </label>
          <div className="field">
            <span>家庭时区</span>
            <Select options={timezoneOptions} value={values.timezone} onChange={(timezone) => setValues({ ...values, timezone })} />
          </div>
          <label className="field">
            <span>家长 PIN（4–6 位数字）</span>
            <Input required inputMode="numeric" maxLength={6} pattern="[0-9]{4,6}" size="large" type="password" value={values.pin} onChange={(event) => setValues({ ...values, pin: event.target.value.replace(/\D/g, "") })} />
          </label>
          <label className="field">
            <span>一次性初始化密钥</span>
            <Input required size="large" type="password" value={values.bootstrapSecret} onChange={(event) => setValues({ ...values, bootstrapSecret: event.target.value })} />
          </label>
          <Button block htmlType="submit" loading={busy} size="large" type="primary">开始使用</Button>
        </Form>
      </Card>
    </main>
  );
}
