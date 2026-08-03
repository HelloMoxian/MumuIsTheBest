import assert from "node:assert/strict";
import test from "node:test";
import {
  RHYME_ANNOTATED_CHAPTERS,
  RHYME_CHAPTERS,
  allSentences,
  pairedTerms,
  sentenceNarration,
} from "./content";
import { RHYME_ORIGINAL_CHAPTERS } from "./original";

test("声律启蒙目录完整列出上下卷三十章", () => {
  assert.equal(RHYME_CHAPTERS.length, 30);
  assert.equal(RHYME_CHAPTERS.filter((chapter) => chapter.volume === "上卷").length, 15);
  assert.equal(RHYME_CHAPTERS.filter((chapter) => chapter.volume === "下卷").length, 15);
  assert.equal(new Set(RHYME_CHAPTERS.map((chapter) => chapter.id)).size, 30);
  assert.deepEqual(
    RHYME_CHAPTERS.filter((chapter) => chapter.annotated).map((chapter) => chapter.title),
    ["一东", "二冬", "三江", "四支", "五微"],
  );
});

test("三十章原文均按三则十八句收录", () => {
  assert.equal(RHYME_ORIGINAL_CHAPTERS.length, 30);
  assert.deepEqual(
    RHYME_ORIGINAL_CHAPTERS.map((chapter) => chapter.id),
    RHYME_CHAPTERS.map((chapter) => chapter.id),
  );
  for (const chapter of RHYME_ORIGINAL_CHAPTERS) {
    assert.equal(chapter.sections.length, 3, `${chapter.title} 应包含三则原文`);
    assert.deepEqual(chapter.sections.map((section) => section.length), [6, 6, 6]);
    assert.ok(chapter.sections.flat().every((sentence) => sentence.length >= 5));
  }
});

test("前五章各有三则十八句完整精注", () => {
  assert.equal(RHYME_ANNOTATED_CHAPTERS.length, 5);
  for (const chapter of RHYME_ANNOTATED_CHAPTERS) {
    assert.equal(chapter.sections.length, 3, `${chapter.title} 应包含三则`);
    assert.deepEqual(chapter.sections.map((section) => section.sentences.length), [6, 6, 6]);
    assert.equal(allSentences(chapter).length, 18);
  }
  const ids = RHYME_ANNOTATED_CHAPTERS.flatMap((chapter) => allSentences(chapter).map((sentence) => sentence.id));
  assert.equal(new Set(ids).size, 90);
});

test("每句都有拼音、儿童解释、词语卡、对子原因和故事层", () => {
  for (const chapter of RHYME_ANNOTATED_CHAPTERS) {
    for (const sentence of allSentences(chapter)) {
      assert.ok(sentence.text.length >= 5, sentence.id);
      assert.ok(sentence.pinyin.length >= 5, sentence.id);
      assert.ok(sentence.meaning.length >= 12, sentence.id);
      assert.ok(sentence.terms.length >= 2, sentence.id);
      assert.equal(sentence.terms.length % 2, 0, `${sentence.id} 的词语必须左右成对`);
      assert.equal(pairedTerms(sentence).length * 2, sentence.terms.length, sentence.id);
      assert.ok(sentence.pairing.length >= 12, sentence.id);
      assert.ok(sentence.storyTitle.length >= 4, sentence.id);
      assert.ok(sentence.story.length >= 12, sentence.id);
      assert.ok(sentence.terms.every((term) => term.word && term.pinyin && term.meaning));
    }
  }
});

test("第三至第五章精注原文与全书原文逐句一致", () => {
  for (const chapter of RHYME_ANNOTATED_CHAPTERS.slice(2)) {
    const original = RHYME_ORIGINAL_CHAPTERS.find((item) => item.id === chapter.id);
    assert.ok(original, chapter.id);
    assert.deepEqual(
      allSentences(chapter).map((sentence) => sentence.text),
      original.sections.flat(),
      chapter.title,
    );
  }
});

test("讲解不向儿童加入平仄和词性术语，朗读稿包含所有解释层", () => {
  for (const chapter of RHYME_ANNOTATED_CHAPTERS) {
    for (const sentence of allSentences(chapter)) {
      const narration = sentenceNarration(sentence);
      assert.equal(narration.includes("平仄"), false, sentence.id);
      assert.equal(narration.includes("词性"), false, sentence.id);
      assert.ok(narration.includes(sentence.meaning));
      assert.ok(narration.includes(sentence.pairing));
      assert.ok(narration.includes(sentence.story));
    }
  }
});
