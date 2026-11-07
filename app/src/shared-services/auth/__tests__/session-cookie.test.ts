/** 会话 Cookie 解析：两种登录态都要能取到，取不到或值为空即为 null */
import { describe, expect, it } from "vitest";

import { readSessionToken } from "../session-cookie";

describe("readSessionToken", () => {
  it("先取管理端令牌，再取客户端令牌", () => {
    expect(readSessionToken("hub_admin_token=admin-jwt; other=1")).toBe("admin-jwt");
    expect(readSessionToken("other=1; hub_client_token=client-jwt")).toBe("client-jwt");
    expect(readSessionToken("hub_admin_token=admin-jwt; hub_client_token=client-jwt")).toBe(
      "admin-jwt",
    );
  });

  it("空值当作没有，继续看下一个", () => {
    expect(readSessionToken("hub_admin_token=; hub_client_token=client-jwt")).toBe("client-jwt");
  });

  it("缺等号、只有名字、没有目标名都返回 null", () => {
    expect(readSessionToken("hub_admin_token")).toBeNull();
    expect(readSessionToken("other=1")).toBeNull();
    expect(readSessionToken(undefined)).toBeNull();
    expect(readSessionToken("")).toBeNull();
  });
});
