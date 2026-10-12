import { render } from "@testing-library/react";
import { drawable, splitPath } from "./drawable";

describe("أيقونات قابلة للرسم", () => {
  it("يقسم المسار عند كل M ويحفظ الأوامر النسبية", () => {
    expect(splitPath("M4 4h16v16H4zM4 9h16 m2 2h1")).toEqual(["M4 4h16v16H4z", "M4 9h16", "m2 2h1"]);
    expect(splitPath("M12 5v14")).toEqual(["M12 5v14"]);
  });

  it("يعطي كل شكل طولاً منسوباً 1 ويقسم المسارات داخل الأجزاء", () => {
    const { container } = render(
      <svg>
        {drawable(
          <>
            <rect x="1" y="1" width="2" height="2" />
            <path d="M1 1h2M3 3v2" stroke="red" />
          </>,
        )}
      </svg>,
    );
    const paths = container.querySelectorAll("path");
    expect(paths).toHaveLength(2);
    expect([...paths].map((p) => p.getAttribute("pathLength"))).toEqual(["1", "1"]);
    expect(paths[1]?.getAttribute("stroke")).toBe("red");
    expect(container.querySelector("rect")?.getAttribute("pathLength")).toBe("1");
  });
});
