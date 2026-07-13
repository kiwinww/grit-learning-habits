import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "家庭星币成长站",
    short_name: "星币成长站",
    description: "家庭内部儿童学习习惯与星币奖励工具",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f0d9",
    theme_color: "#2f7d63",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" }
    ]
  };
}
