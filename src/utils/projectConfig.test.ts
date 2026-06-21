import { describe, expect, it } from "vitest";

import { createDefaultProject } from "@/utils/defaultProject";
import {
  parseProjectConfig,
  serializeProjectConfig,
} from "@/utils/projectConfig";

describe("projectConfig", () => {
  it("序列化再解析能无损还原工程（round-trip）", () => {
    const project = createDefaultProject();
    const raw = serializeProjectConfig(project);
    const result = parseProjectConfig(raw);

    expect(result.error).toBeNull();
    expect(result.project).not.toBeNull();
    expect(result.project?.name).toBe(project.name);
    expect(result.project?.modules.length).toBe(project.modules.length);
    // 父子关系（parentId）应被完整保留：取示例里任一带父的模块，比对还原后是否同父。
    const nested = project.modules.find((m) => m.parentId !== null);
    expect(nested).toBeDefined();
    expect(
      result.project?.modules.find((m) => m.id === nested!.id)?.parentId,
    ).toBe(nested!.parentId);
  });

  it("非 JSON 文本返回友好错误而非抛错", () => {
    const result = parseProjectConfig("这不是 json");

    expect(result.project).toBeNull();
    expect(result.error).toContain("JSON");
  });

  it("缺少 format/version 标记的 JSON 被拒绝", () => {
    const result = parseProjectConfig(
      JSON.stringify({ project: createDefaultProject() }),
    );

    expect(result.project).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it("导出的配置带 format 与 version 标记", () => {
    const raw = serializeProjectConfig(createDefaultProject());
    const parsed = JSON.parse(raw);

    expect(parsed.format).toBe("ui-planner-config");
    expect(parsed.version).toBe(1);
    expect(typeof parsed.exportedAt).toBe("string");
  });
});
