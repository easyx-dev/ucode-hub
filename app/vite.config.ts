import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, type PluginOption } from "vite";

/** 应用版本号（来自 app/package.json，构建时注入 __APP_VERSION__） */
const appVersion = (
  JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
    version: string;
  }
).version;

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  // 预渲染外壳时插件会起一个 `vite preview` 并回环请求它：显式钉 IPv4，
  // 否则容器里 localhost 解析到 127.0.0.1 而 preview 只监听 ::1，预渲染会连不上、静默产出 0 个页面
  preview: { host: "127.0.0.1" },
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    // 单页应用：页面请求只回外壳，路由与数据加载都在浏览器里。
    // 构建插件只在 dev 注入这个开关，生产由这里以编译期常量固定下来
    // （运行期再赋值会依赖 SSR bundle 的惰性加载顺序，顺序一变就静默退回服务端渲染）。
    "process.env.TSS_SHELL": JSON.stringify("true"),
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      router: {
        routeFileIgnorePattern: "\\.(functions|server|schemas)\\.ts$|__tests__",
      },
      // 纯单页应用：服务端不渲染路由内容，只回一份空外壳 HTML；路由与数据加载全部在浏览器里完成。
      // 构建末段会预渲染一次外壳（插件在 spa.enabled 时强制打开），因此 app/server.ts 在预渲染阶段
      // 跳过启动初始化、build 脚本提供占位环境变量——两者缺一，构建就会要求运行环境或写入数据目录。
      spa: {
        enabled: true,
        maskPath: "/",
      },
      importProtection: {
        client: {
          // 服务端专属依赖：客户端误引即构建失败（captcha 引擎等服务端文件依赖 opentype.js + Buffer）；
          // node:crypto 覆盖「中间件经 start.ts 同时进入客户端模块图」这类误引（浏览器侧只会拿到会抛错的空壳）
          specifiers: ["bcryptjs", "drizzle-orm", "openai", "opentype.js", "node:crypto"],
        },
      },
    }),
    viteReact(),
    // Nitro 只负责打包，server.ts 由 Nitro 自动检测作为 server entry。
    // serverDir 声明服务端目录扫描（server/routes/**、server/middleware/** → 路由与全局中间件）：
    // 中继的数据面（隧道升级与 ingress 回灌）走这一层，直接拿裸请求 / 响应，不经过 SSR 路由与请求体处理。
    // features.websocket 开启 WebSocket：生产 node preset 挂 upgrade 监听，dev 的 vite dev server 同样透传。
    nitro({ serverDir: "server", features: { websocket: true } }),
    // 修复：Vite dev server 在 Sec-Fetch-Dest: image 时会将路由当作静态资源拦截，
    // 导致 <img> 标签加载图片返回 404。此插件在 Vite 内部中间件之前移除该请求头
    secFetchDestImageFix(),
  ],
});

/** 开发环境修复：移除 Sec-Fetch-Dest: image 避免 Vite 内部中间件拦截 */
function secFetchDestImageFix(): PluginOption {
  return {
    name: "sec-fetch-dest-image-fix",
    configureServer(server) {
      server.middlewares.stack.unshift({
        route: "",
        handle: (req: IncomingMessage, _res: ServerResponse, next: () => void) => {
          if (req.headers["sec-fetch-dest"] === "image") {
            delete req.headers["sec-fetch-dest"];
          }
          next();
        },
      } as never);
    },
  };
}

export default config;
