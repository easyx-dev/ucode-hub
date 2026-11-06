/**
 * 国际化 CRUD 测试：UI 翻译维护
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#/shared-services/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const { mockCache } = vi.hoisted(() => {
  const cacheStore = new Map<string, Record<string, string>>();
  return {
    mockCache: {
      get: vi.fn((locale: string) => cacheStore.get(locale)),
      set: vi.fn((locale: string, data: Record<string, string>) => cacheStore.set(locale, data)),
      delete: vi.fn((locale: string) => {
        cacheStore.delete(locale);
        return true;
      }),
      keys: vi.fn(() => Array.from(cacheStore.keys())),
    },
  };
});

vi.mock("#/shared-services/i18n/i18n.ui.cache", () => ({
  uiTranslationCache: mockCache,
}));

const { mockDb, mockRows, insertValues, onConflictDoUpdate } = vi.hoisted(() => {
  const rows = vi.fn().mockReturnValue([]);
  const chain: any = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    offset: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    // 事务内以 .all() 同步取值，故终结符返回行数组本身
    all: vi.fn(() => rows()),
    get: vi.fn(() => rows()[0]),
  };
  Object.defineProperty(chain, "then", {
    value: (onFulfilled: (value: unknown) => unknown) => Promise.resolve(rows()).then(onFulfilled),
  });
  // 事务内 upsert 以 .run() 收尾，故 onConflictDoUpdate 之后还要能续 .run()（顶层 await 同一形态也成立）
  const onConflictDoUpdate = vi.fn(() => ({ run: vi.fn() }));
  // insert(...).values(batch) 返回 { onConflictDoUpdate } 供 upsert / 导入链式调用
  const insertValues = vi.fn((..._args: unknown[]) => ({
    onConflictDoUpdate,
  }));
  return {
    mockRows: rows,
    insertValues,
    onConflictDoUpdate,
    mockDb: {
      select: vi.fn(() => chain),
      $count: vi.fn(),
      insert: vi.fn(() => ({ values: insertValues })),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
      delete: vi.fn(() => ({ where: vi.fn() })),
    },
  };
});
vi.mock("#/db", () => ({ db: mockDb }));

import {
  deleteUITranslation,
  getAllUITranslationsForExport,
  getUITranslations,
  importUiTranslations,
  listUITranslations,
  loadUITranslations,
  refreshUITranslationCache,
  upsertUITranslation,
} from "#/shared-services/i18n/i18n.server";

beforeEach(() => vi.clearAllMocks());

const uiRecord = {
  id: "u-1",
  locale: "en",
  key: "home.title",
  value: "Welcome",
  valueType: "input",
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("listUITranslations", () => {
  beforeEach(() => vi.clearAllMocks());
  it("无筛选条件返回分页列表", async () => {
    mockRows.mockResolvedValue([uiRecord]);
    mockDb.$count.mockResolvedValue(1);
    const result = await listUITranslations();
    expect(result.records).toHaveLength(1);
    expect(result.total).toBe(1);
  });
});

describe("upsertUITranslation", () => {
  beforeEach(() => vi.clearAllMocks());
  it("新建 UI 翻译（原子 upsert，无 select 竞态）", async () => {
    const result = await upsertUITranslation({
      locale: "en",
      key: "test.key",
      value: "Value",
    });
    expect(result.success).toBe(true);
    expect(mockDb.insert).toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(onConflictDoUpdate).toHaveBeenCalledTimes(1);
  });
  it("更新已有 UI 翻译", async () => {
    mockRows.mockResolvedValue([uiRecord]);
    const result = await upsertUITranslation({
      id: "u-1",
      locale: "en",
      key: "home.title",
      value: "Updated",
    });
    expect(result.success).toBe(true);
    expect(mockDb.update).toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });
});

describe("deleteUITranslation", () => {
  beforeEach(() => vi.clearAllMocks());
  it("删除存在的翻译", async () => {
    mockRows.mockResolvedValue([uiRecord]);
    mockCache.keys.mockReturnValue([]);
    const result = await deleteUITranslation("u-1");
    expect(result).toBe(true);
  });
  it("不存在的翻译返回 false", async () => {
    mockRows.mockResolvedValue([]);
    const result = await deleteUITranslation("不存在");
    expect(result).toBe(false);
  });
});

describe("loadUITranslations", () => {
  it("从数据库加载指定语言并组装为键值映射", async () => {
    mockRows.mockResolvedValue([
      uiRecord,
      { ...uiRecord, id: "u-2", key: "home.sub", value: "Sub" },
    ]);

    const result = await loadUITranslations("en");

    expect(result).toEqual({ "home.title": "Welcome", "home.sub": "Sub" });
  });

  it("无翻译时返回空对象", async () => {
    mockRows.mockResolvedValue([]);

    const result = await loadUITranslations("zh");
    expect(result).toEqual({});
  });
});

describe("getUITranslations", () => {
  it("缓存命中时直接返回", async () => {
    mockCache.get.mockReturnValue({ "home.title": "Welcome" });

    const result = await getUITranslations("en");

    expect(result).toEqual({ "home.title": "Welcome" });
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("缓存未命中时加载并写入缓存", async () => {
    mockCache.get.mockReturnValue(undefined);
    mockRows.mockResolvedValue([uiRecord]);

    const result = await getUITranslations("en");

    expect(result).toEqual({ "home.title": "Welcome" });
    expect(mockCache.set).toHaveBeenCalledWith("en", {
      "home.title": "Welcome",
    });
  });
});

describe("refreshUITranslationCache", () => {
  it("指定语言时仅失效该语言缓存（懒加载重建）", async () => {
    await refreshUITranslationCache("en");

    expect(mockCache.delete).toHaveBeenCalledWith("en");
    expect(mockCache.set).not.toHaveBeenCalled();
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("不指定语言时清空全部缓存", async () => {
    mockCache.keys.mockReturnValue(["en", "zh"]);

    await refreshUITranslationCache();

    expect(mockCache.delete).toHaveBeenCalledTimes(2);
    expect(mockDb.select).not.toHaveBeenCalled();
  });
});

describe("getAllUITranslationsForExport", () => {
  it("返回排序后的全部 UI 翻译", async () => {
    mockRows.mockResolvedValue([uiRecord]);

    const result = await getAllUITranslationsForExport();

    expect(result).toEqual([
      { locale: "en", key: "home.title", value: "Welcome", valueType: "input" },
    ]);
  });
});

describe("importUiTranslations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("批量导入：单次预查询统计新增/更新，按唯一键去重", async () => {
    // 预查询已有 (locale, key)：仅 en::home.title 存在 → 该条更新，zh::new.key 新增
    mockRows.mockReset().mockResolvedValue([uiRecord]);

    const result = await importUiTranslations({
      translations: [
        { locale: "en", key: "home.title", value: "New", valueType: "input" },
        { locale: "zh", key: "new.key", value: "新", valueType: "input" },
      ],
    });

    expect(result).toEqual({ created: 1, updated: 1 });
    // 单次批量写入 + 原子冲突更新（无逐条 select）
    expect(mockDb.select).toHaveBeenCalledTimes(1);
    expect(insertValues).toHaveBeenCalledTimes(1);
    expect(insertValues.mock.calls[0][0]).toHaveLength(2);
    expect(onConflictDoUpdate).toHaveBeenCalledTimes(1);
  });

  it("导入数据中含重复唯一键时按一条去重", async () => {
    mockRows.mockReset().mockResolvedValue([]);

    const result = await importUiTranslations({
      translations: [
        { locale: "en", key: "dup", value: "v1", valueType: "input" },
        { locale: "en", key: "dup", value: "v2", valueType: "input" },
      ],
    });

    expect(result).toEqual({ created: 1, updated: 0 });
    expect(insertValues.mock.calls[0][0]).toHaveLength(1);
  });

  it("非法的 valueType 回退到 input，且不污染入参", async () => {
    mockRows.mockReset().mockResolvedValue([]);
    const input = {
      translations: [{ locale: "en", key: "k", value: "v", valueType: "bad-type" }],
    };

    await importUiTranslations(input);

    const inserted = insertValues.mock.calls[0][0] as { valueType: string }[];
    expect(inserted[0].valueType).toBe("input");
    expect(input.translations[0].valueType).toBe("bad-type");
  });
});
