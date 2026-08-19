import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  localizedUiText,
  translateUiText,
} from "./translations";

describe("global UI translations", () => {
  it("translates stable interface labels", () => {
    assert.equal(translateUiText("木木学习岛"), "Mumu Learning Island");
    assert.equal(translateUiText("检查答案"), "check answer");
  });

  it("fills generated template translations without changing values", () => {
    assert.equal(
      translateUiText("获得 18 个知识币，现在共有 203 个。"),
      "Earned 18 Knowledge Coins, now totaling 203.",
    );
  });

  it("renders bilingual UI as Chinese followed by English on a new line", () => {
    assert.equal(
      localizedUiText("学习大厅", "bilingual"),
      "学习大厅\nLearning Hall",
    );
  });

  it("leaves Arabic-number arithmetic problems untouched in every mode", () => {
    const problem = "4 + 3 = 7";
    assert.equal(localizedUiText(problem, "zh"), problem);
    assert.equal(localizedUiText(problem, "en"), problem);
    assert.equal(localizedUiText(problem, "bilingual"), problem);
  });

  it("preserves an isolated learning character instead of replacing course content", () => {
    assert.equal(translateUiText("学"), "学");
  });
});
