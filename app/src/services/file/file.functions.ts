/**
 * 文件管理：Server Function 包装器
 */
import { sniffImage } from "@easyx/image-toolkit";
import { createServerFn } from "@tanstack/react-start";
import { adminPermGuard } from "#/middleware/admin-auth";
import { ADMIN_PERMISSIONS } from "#/permissions/admin-permissions";
import { logCrud } from "#/shared-services/operation-log/operation-log.server";
import { fileIdSchema, fileListSchema } from "./file.schemas";
import { getFileInfo, getFileList, uploadFile } from "./file.server";

/** 获取文件列表（分页、筛选、搜索、排序） */
export const getFileListSFn = createServerFn({ method: "GET" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.FILE_VIEW)])
  .validator(fileListSchema)
  .handler(async ({ data }) => getFileList(data));

/** 上传文件（支持 SHA256 秒传） */
export const uploadFileSFn = createServerFn({ method: "POST" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.FILE_UPLOAD)])
  .validator((data: unknown) => {
    if (!(data instanceof FormData)) throw new Error("Expected FormData");
    const f = data.get("file");
    if (!f || !(f instanceof File)) throw new Error("未选择文件");
    const permanent = data.get("permanent") === "true";
    return { file: f, permanent };
  })
  .handler(async ({ data: { file: fileField, permanent }, context }) => {
    const buffer = Buffer.from(await fileField.arrayBuffer());
    const originalName = fileField.name;

    // 以魔数嗅探结果为准；非可识别类型时回退客户端声明
    const sniffed = sniffImage(buffer);
    const mimeType = sniffed?.mimeType || fileField.type || "application/octet-stream";
    const imageMeta =
      sniffed && sniffed.width !== null && sniffed.height !== null
        ? { width: sniffed.width, height: sniffed.height }
        : null;

    const { record, isDuplicated } = await uploadFile(
      buffer,
      originalName,
      mimeType,
      permanent,
      imageMeta,
    );

    logCrud(context.user, "file", "upload", {
      id: record.id,
      name: record.originalName,
    });

    return {
      success: true,
      data: {
        id: record.id,
        originalName: record.originalName,
        size: record.size,
        isDuplicated,
      },
    };
  });

/** 根据文件 ID 查询原始文件名（供预览组件使用） */
export const getFileInfoSFn = createServerFn({ method: "GET" })
  .middleware([adminPermGuard(ADMIN_PERMISSIONS.FILE_VIEW)])
  .validator(fileIdSchema)
  .handler(async ({ data }) => getFileInfo(data.id));
