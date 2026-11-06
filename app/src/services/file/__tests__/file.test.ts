/**
 * 文件管理测试：SHA256 + 读取 + 清理 + 列表 + 删除 + 转永久
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#/shared-services/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const { mockStorage } = vi.hoisted(() => ({
  mockStorage: {
    read: vi.fn(),
    delete: vi.fn(),
    save: vi.fn(),
    getUrl: vi.fn(),
    exists: vi.fn(),
  },
}));
vi.mock("#/shared-services/storage", () => ({ storage: mockStorage }));

const { mockDb, mockRows, mockSelectChain } = vi.hoisted(() => {
  const rows = vi.fn().mockResolvedValue([]);
  const chain: any = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    offset: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
  };
  Object.defineProperty(chain, "then", {
    value: (onFulfilled: (value: unknown) => unknown) => rows().then(onFulfilled),
  });
  return {
    mockRows: rows,
    mockSelectChain: chain,
    mockDb: {
      select: vi.fn(() => chain),
      $count: vi.fn(),
      insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn() })) })),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
      delete: vi.fn(() => ({ where: vi.fn() })),
    },
  };
});
vi.mock("#/db", () => ({ db: mockDb }));

import {
  cleanExpiredFiles,
  deleteFile,
  getFileInfo,
  getFileList,
  makePermanent,
  readFileContent,
  removeFile,
  sha256,
  TEMP_EXPIRE_HOURS,
  updateFileTags,
  uploadFile,
} from "#/services/file/file.server";
import { logger } from "#/shared-services/logger";

const fileRecord = {
  id: "f-1",
  sha256: "abc123",
  originalName: "测试.txt",
  storedName: "uuid.txt",
  mimeType: "text/plain",
  size: 1024,
  path: "2024-01-01/uuid.txt",
  status: "temp" as const,
  expiredAt: null as Date | null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null as Date | null,
  createdBy: null,
};

describe("sha256", () => {
  it("对已知输入产生预期哈希值", () => {
    const hash = sha256(Buffer.from("hello"));
    expect(hash).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  });

  it("不同输入产生不同哈希值", () => {
    const hash1 = sha256(Buffer.from("hello"));
    const hash2 = sha256(Buffer.from("world"));
    expect(hash1).not.toBe(hash2);
  });
});

describe("readFileContent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("文件存在时返回 buffer 和 record", async () => {
    const content = Buffer.from("文件内容");
    mockRows.mockResolvedValue([fileRecord]);
    mockStorage.read.mockResolvedValue(content);

    const result = await readFileContent("f-1");
    expect(result).not.toBeNull();
    expect(result!.buffer).toEqual(content);
    expect(result!.record.id).toBe("f-1");
    expect(mockStorage.read).toHaveBeenCalledWith(fileRecord.path);
  });

  it("文件不存在时返回 null", async () => {
    mockRows.mockResolvedValue([]);

    const result = await readFileContent("不存在");
    expect(result).toBeNull();
  });

  it("物理文件缺失（孤儿记录）时返回 null 而非抛出", async () => {
    mockRows.mockResolvedValue([fileRecord]);
    const enoent = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    mockStorage.read.mockRejectedValue(enoent);

    const result = await readFileContent("f-1");

    expect(result).toBeNull();
    expect(vi.mocked(logger.warn)).toHaveBeenCalled();
  });

  it("其他 IO 异常仍然向上抛出，避免掩盖真实故障", async () => {
    mockRows.mockResolvedValue([fileRecord]);
    mockStorage.read.mockRejectedValue(Object.assign(new Error("EACCES"), { code: "EACCES" }));

    await expect(readFileContent("f-1")).rejects.toThrow("EACCES");
  });
});

describe("cleanExpiredFiles", () => {
  beforeEach(() => vi.clearAllMocks());

  it("无过期文件时返回 0", async () => {
    mockRows.mockResolvedValue([]);

    const result = await cleanExpiredFiles();
    expect(result).toBe(0);
  });

  it("有过期文件时返回数量并调用 storage.delete", async () => {
    const expired = [
      { ...fileRecord, id: "f-1", path: "path1.txt" },
      { ...fileRecord, id: "f-2", path: "path2.txt" },
    ];
    mockRows.mockResolvedValue(expired);
    mockStorage.delete.mockResolvedValue(undefined);

    const result = await cleanExpiredFiles();
    expect(result).toBe(2);
    expect(mockDb.update).toHaveBeenCalled();
    expect(mockStorage.delete).toHaveBeenCalledTimes(2);
    expect(mockStorage.delete).toHaveBeenCalledWith("path1.txt");
    expect(mockStorage.delete).toHaveBeenCalledWith("path2.txt");
  });

  it("storage.delete 报错时被捕获不中断流程", async () => {
    const expired = [{ ...fileRecord, id: "f-1", path: "bad.txt" }];
    mockRows.mockResolvedValue(expired);
    mockStorage.delete.mockRejectedValue(new Error("磁盘错误"));

    const result = await cleanExpiredFiles();
    expect(result).toBe(1);
  });
});

describe("getFileList", () => {
  beforeEach(() => vi.clearAllMocks());

  it("返回分页文件列表（空）", async () => {
    mockRows.mockResolvedValue([]);
    mockDb.$count.mockResolvedValue(0);

    const result = await getFileList();
    expect(result.records).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
  });

  it("按状态筛选文件列表（where 条件包含筛选值）", async () => {
    mockRows.mockResolvedValue([fileRecord]);
    mockDb.$count.mockResolvedValue(1);

    const result = await getFileList({ status: "permanent" });
    expect(result.records).toHaveLength(1);
    expect(result.total).toBe(1);
    // 筛选行为：where 条件中应包含状态筛选值（而非仅软删除条件）
    expect(mockSelectChain.where).toHaveBeenCalled();
    const whereArg = mockSelectChain.where.mock.calls[0][0] as unknown;
    expect(extractSqlText(whereArg)).toContain("permanent");
  });
});

/** 递归提取 drizzle SQL 对象的 SQL 文本 */
function extractSqlText(value: unknown): string {
  const out: string[] = [];
  const seen = new WeakSet<object>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (node === null || typeof node !== "object") {
      if (typeof node === "string") out.push(node);
      return;
    }
    // 防止 drizzle SQL 内部循环引用导致栈溢出
    if (seen.has(node)) return;
    seen.add(node);
    const obj = node as Record<string, unknown>;
    if (Array.isArray(obj.queryChunks)) {
      for (const chunk of obj.queryChunks) walk(chunk);
      return;
    }
    if (Array.isArray(obj.value)) {
      for (const v of obj.value) walk(v);
      return;
    }
    for (const v of Object.values(obj)) walk(v);
  };
  walk(value);
  return out.join("").toLowerCase();
}

describe("deleteFile", () => {
  beforeEach(() => vi.clearAllMocks());

  it("不存在的文件返回 false", async () => {
    mockRows.mockResolvedValue([]);

    const result = await deleteFile("不存在");
    expect(result).toBe(false);
  });

  it("已存在的文件删除成功返回 true", async () => {
    mockRows.mockResolvedValue([fileRecord]);

    const result = await deleteFile("f-1");
    expect(result).toBe(true);
    expect(mockDb.update).toHaveBeenCalled();
  });
});

describe("makePermanent", () => {
  it("将临时文件转为永久存储", async () => {
    const result = await makePermanent("f-1");
    expect(result).toBe(true);
    expect(mockDb.update).toHaveBeenCalled();
  });
});

describe("TEMP_EXPIRE_HOURS", () => {
  it("默认值为 168 小时（7 天）", () => {
    expect(TEMP_EXPIRE_HOURS).toBe(168);
  });
});

describe("uploadFile", () => {
  const buffer = Buffer.from("上传文件内容");
  const insertRecord = {
    ...fileRecord,
    id: "f-new",
    status: "temp" as const,
    expiredAt: new Date(),
  };

  beforeEach(() => vi.clearAllMocks());

  it("SHA256 命中已存在的永久文件时返回秒传结果", async () => {
    mockRows.mockResolvedValue([fileRecord]);

    const result = await uploadFile(buffer, "测试.txt", "text/plain", true);

    expect(result.isDuplicated).toBe(true);
    expect(result.record.id).toBe("f-1");
    expect(mockStorage.save).not.toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("永久上传：落盘、入库状态为 permanent 且无过期时间", async () => {
    mockRows.mockResolvedValue([]);
    const valuesMock = vi.fn((_data: unknown) => ({
      returning: vi.fn(() => Promise.resolve([insertRecord])),
    }));
    mockDb.insert.mockReturnValue({ values: valuesMock } as any);
    mockStorage.save.mockResolvedValue(undefined);

    const result = await uploadFile(buffer, "测试.txt", "text/plain", true);

    expect(result.isDuplicated).toBe(false);
    expect(mockStorage.save).toHaveBeenCalledTimes(1);
    const values = valuesMock.mock.calls[0][0] as Record<string, unknown>;
    expect(values).toMatchObject({
      originalName: "测试.txt",
      mimeType: "text/plain",
      size: buffer.length,
      status: "permanent",
      expiredAt: null,
    });
  });

  it("临时上传：入库状态为 temp 且设置 7 天过期时间", async () => {
    mockRows.mockResolvedValue([]);
    const valuesMock = vi.fn((_data: unknown) => ({
      returning: vi.fn(() => Promise.resolve([insertRecord])),
    }));
    mockDb.insert.mockReturnValue({ values: valuesMock } as any);
    mockStorage.save.mockResolvedValue(undefined);

    const before = Date.now();
    await uploadFile(buffer, "测试.txt", "text/plain", false);
    const after = Date.now();

    const values = valuesMock.mock.calls[0][0] as Record<string, unknown>;
    expect(values.status).toBe("temp");
    const expiredAt = values.expiredAt as Date;
    expect(expiredAt.getTime()).toBeGreaterThanOrEqual(before + TEMP_EXPIRE_HOURS * 3600 * 1000);
    expect(expiredAt.getTime()).toBeLessThanOrEqual(after + TEMP_EXPIRE_HOURS * 3600 * 1000);
  });

  it("保留原始文件扩展名并写入存储路径", async () => {
    mockRows.mockResolvedValue([]);
    const valuesMock = vi.fn((_data: unknown) => ({
      returning: vi.fn(() => Promise.resolve([insertRecord])),
    }));
    mockDb.insert.mockReturnValue({ values: valuesMock } as any);
    mockStorage.save.mockResolvedValue(undefined);

    await uploadFile(buffer, "文档.pdf", "application/pdf", true);

    const values = valuesMock.mock.calls[0][0] as Record<string, unknown>;
    expect(values.storedName).toMatch(/^[0-9a-f-]{36}\.pdf$/);
    expect(values.path).toMatch(/^\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.pdf$/);
    expect(mockStorage.save).toHaveBeenCalledWith(values.path, buffer);
  });

  it("无扩展名文件存储时不追加后缀", async () => {
    mockRows.mockResolvedValue([]);
    const valuesMock = vi.fn((_data: unknown) => ({
      returning: vi.fn(() => Promise.resolve([insertRecord])),
    }));
    mockDb.insert.mockReturnValue({ values: valuesMock } as any);
    mockStorage.save.mockResolvedValue(undefined);

    await uploadFile(buffer, "README", "text/plain", true);

    const values = valuesMock.mock.calls[0][0] as Record<string, unknown>;
    expect(values.storedName).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("getFileInfo", () => {
  beforeEach(() => vi.clearAllMocks());

  it("文件存在时返回原始文件名", async () => {
    mockRows.mockResolvedValue([{ originalName: "报告.xlsx" }]);

    const name = await getFileInfo("f-1");
    expect(name).toBe("报告.xlsx");
  });

  it("文件不存在时返回 null", async () => {
    mockRows.mockResolvedValue([]);

    const name = await getFileInfo("不存在");
    expect(name).toBeNull();
  });
});

describe("removeFile", () => {
  beforeEach(() => vi.clearAllMocks());

  it("记录不存在时不删除任何内容", async () => {
    mockRows.mockResolvedValue([]);

    await removeFile("不存在");

    expect(mockDb.delete).not.toHaveBeenCalled();
    expect(mockStorage.delete).not.toHaveBeenCalled();
  });

  it("存在时物理删除记录并清理磁盘文件", async () => {
    mockRows.mockResolvedValue([{ ...fileRecord, path: "2024-01-01/uuid.txt" }]);
    mockStorage.delete.mockResolvedValue(undefined);

    await removeFile("f-1");

    expect(mockDb.delete).toHaveBeenCalled();
    expect(mockStorage.delete).toHaveBeenCalledWith("2024-01-01/uuid.txt");
  });

  it("磁盘文件删除失败仅告警，不抛错", async () => {
    mockRows.mockResolvedValue([fileRecord]);
    mockStorage.delete.mockRejectedValue(new Error("EACCES"));

    await expect(removeFile("f-1")).resolves.toBeUndefined();
    expect(vi.mocked(logger.warn)).toHaveBeenCalled();
  });
});

describe("updateFileTags", () => {
  beforeEach(() => vi.clearAllMocks());

  it("文件不存在时返回 false 且不写库", async () => {
    mockRows.mockReset().mockResolvedValue([]);

    expect(await updateFileTags("不存在", ["产品"])).toBe(false);
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("文件存在时写入标签并返回 true", async () => {
    mockRows.mockReset().mockResolvedValue([{ id: "f-1" }]);

    expect(await updateFileTags("f-1", ["产品", "案例"])).toBe(true);
    expect(mockDb.update).toHaveBeenCalled();
  });

  it("空数组表示清空标签", async () => {
    mockRows.mockReset().mockResolvedValue([{ id: "f-1" }]);

    expect(await updateFileTags("f-1", [])).toBe(true);
    expect(mockDb.update).toHaveBeenCalled();
  });
});
