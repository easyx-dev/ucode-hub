/** Bearer 令牌解析：这是凭证解析的唯一实现，边界语义（多余段一律无效）在此定义 */
import { describe, expect, it } from "vitest";

import { parseBearerToken } from "../bearer";

describe("parseBearerToken", () => {
  it("取出令牌，方案大小写不敏感、两侧空白容错", () => {
    expect(parseBearerToken("Bearer abc")).toBe("abc");
    expect(parseBearerToken("  bearer  abc  ")).toBe("abc");
  });

  it("缺失、方案不符、空令牌、多余段一律 null", () => {
    expect(parseBearerToken(undefined)).toBeNull();
    expect(parseBearerToken(null)).toBeNull();
    expect(parseBearerToken("")).toBeNull();
    expect(parseBearerToken("Basic abc")).toBeNull();
    expect(parseBearerToken("Bearer")).toBeNull();
    expect(parseBearerToken("Bearer ")).toBeNull();
    expect(parseBearerToken("Bearer a b")).toBeNull();
  });
});
