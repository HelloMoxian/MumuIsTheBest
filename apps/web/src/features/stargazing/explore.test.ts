import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CATALOG_INFO, CONSTELLATIONS, SOURCES, STARS } from "./catalog";
import { constellationFigureStars, constellationStars, matchesQuery, parseObserverInputs, quantity, SKY_COLLECTIONS, stellarColorLabel } from "./explore";
import { angularDistance } from "./astronomy";
import { atlasLineSegments, atlasNearestConstellation, atlasPoint } from "./AllSkyMap";

const IAU_IDS = "And Ant Aps Aql Aqr Ara Ari Aur Boo CMa CMi CVn Cae Cam Cap Car Cas Cen Cep Cet Cha Cir Cnc Col Com CrA CrB Crt Cru Crv Cyg Del Dor Dra Equ Eri For Gem Gru Her Hor Hya Hyi Ind LMi Lac Leo Lep Lib Lup Lyn Lyr Men Mic Mon Mus Nor Oct Oph Ori Pav Peg Per Phe Pic PsA Psc Pup Pyx Ret Scl Sco Sct Ser Sex Sge Sgr Tau Tel TrA Tri Tuc UMa UMi Vel Vir Vol Vul".split(" ");

describe("stargazing bundled astronomical catalog", () => {
  it("contains all 88 IAU constellation identifiers, unique Chinese names and a complete editorial order", () => {
    assert.deepEqual(CONSTELLATIONS.map(item => item.id).sort(), IAU_IDS.sort());
    assert.equal(new Set(CONSTELLATIONS.map(item => item.name)).size, 88);
    assert.deepEqual(CONSTELLATIONS.map(item => item.rank).sort((a, b) => a - b), Array.from({ length: 88 }, (_, i) => i + 1));
    assert.ok(CATALOG_INFO.rankingNote.includes("非官方"));
    for (const item of CONSTELLATIONS) {
      assert.ok(item.name.endsWith("座") && item.latinName.length > 0);
      assert.ok(item.area > 0 && item.area < 1_400);
      assert.ok(item.ra >= 0 && item.ra < 360 && Math.abs(item.dec) <= 90);
      assert.ok(item.lines.length > 0 && item.lines.every(line => line.length >= 2));
      assert.ok(item.lines.flat().every(([ra, dec]) => Number.isFinite(ra) && ra >= 0 && ra < 360 && Number.isFinite(dec) && Math.abs(dec) <= 90));
      assert.ok(item.sourceUrls.length > 0 && item.sourceUrls.every(url => url.startsWith("https://")));
    }
  });

  it("keeps thousands of real stars unique, coordinate-valid and associated with real constellations", () => {
    assert.ok(STARS.length > 8_000);
    assert.equal(new Set(STARS.map(star => star.id)).size, STARS.length);
    assert.equal(CATALOG_INFO.starCount, STARS.length);
    assert.ok(STARS.every(star => star.id > 0 && Number.isInteger(star.id) && star.ra >= 0 && star.ra < 360 && Math.abs(star.dec) <= 90));
    assert.ok(STARS.every(star => Number.isFinite(star.magnitude) && star.magnitude <= 6.5 && IAU_IDS.includes(star.constellation!)));
    assert.ok(STARS.every(star => star.sourceUrls.length > 0));
    for (const star of STARS) {
      for (const value of [star.distanceLy, star.temperatureK, star.radiusSolar, star.massSolar, star.luminositySolar]) assert.ok(value === null || (Number.isFinite(value) && value > 0));
      assert.ok(star.rotationKmS === null || (Number.isFinite(star.rotationKmS) && star.rotationKmS >= 0));
    }
    assert.ok(SOURCES.some(source => /iau|eso\.org/.test(source.url)));
  });

  it("resolves every collection member and includes all thirteen astronomical zodiac constellations", () => {
    assert.equal(new Set(SKY_COLLECTIONS.map(item => item.id)).size, SKY_COLLECTIONS.length);
    for (const collection of SKY_COLLECTIONS) {
      assert.ok(collection.ids.length >= 3);
      assert.equal(new Set(collection.ids).size, collection.ids.length);
      assert.ok(collection.ids.every(id => IAU_IDS.includes(id)));
      assert.ok(collection.view.fov >= 15 && collection.view.fov <= 160 && Math.abs(collection.view.dec) <= 90);
    }
    const zodiac = SKY_COLLECTIONS.find(item => item.id === "zodiac")!;
    assert.equal(zodiac.ids.length, 13);
    assert.ok(zodiac.ids.includes("Oph"));
    assert.deepEqual([...zodiac.ids].sort(), CONSTELLATIONS.filter(item => item.zodiac).map(item => item.id).sort());
  });

  it("keeps the traditional twelve distinct from the astronomical thirteen and opens dispersed groups in the atlas", () => {
    const twelve = SKY_COLLECTIONS.find(item => item.id === "zodiac-twelve")!;
    const thirteen = SKY_COLLECTIONS.find(item => item.id === "zodiac")!;
    assert.equal(twelve.name, "十二星座");
    assert.equal(twelve.ids.length, 12);
    assert.equal(twelve.ids.includes("Oph"), false);
    assert.deepEqual([...twelve.ids, "Oph"].sort(), [...thirteen.ids].sort());
    const famous = SKY_COLLECTIONS.find(item => item.id === "famous")!;
    assert.ok(famous.ids.length >= 5 && famous.ids.length <= 8);
    for (const id of ["famous", "zodiac-twelve", "bright-triangles", "zodiac"]) {
      const collection = SKY_COLLECTIONS.find(item => item.id === id)!;
      assert.equal(collection.category, "featured");
      assert.equal(collection.atlas, true);
    }
    assert.deepEqual(SKY_COLLECTIONS.filter(item => item.category === "seasons").map(item => item.id).sort(), ["autumn", "spring", "summer", "winter"]);
    assert.deepEqual(SKY_COLLECTIONS.filter(item => item.category === "hemispheres").map(item => item.id).sort(), ["north", "south"]);
  });

  it("groups the six documented winter and summer triangle stars by their actual constellations", () => {
    const triangleStarNames = ["Sirius", "Betelgeuse", "Procyon", "Vega", "Altair", "Deneb"];
    const triangleConstellations = triangleStarNames.map(name => STARS.find(star => star.latinName === name)!.constellation!);
    const collection = SKY_COLLECTIONS.find(item => item.id === "bright-triangles")!;
    assert.deepEqual([...collection.ids].sort(), triangleConstellations.sort());
    assert.equal(collection.ids.length, 6);
  });
});

describe("stargazing discovery and stellar membership", () => {
  it("searches official names, informal Chinese aliases, English, abbreviations and fullwidth input", () => {
    for (const [id, queries] of [["Sgr", ["射手", "射手座", "人马", "Sagittarius", "sgr"]], ["Vir", ["处女", "处女座", "室女"]], ["Aqr", ["水瓶", "水瓶座", "宝瓶"]], ["Ori", ["猎户", "Orion", "ＯＲＩ"]], ["UMa", ["北斗七星"]]] as const) {
      const item = CONSTELLATIONS.find(constellation => constellation.id === id)!;
      for (const query of queries) assert.ok(matchesQuery(item, query), `${id}: ${query}`);
      assert.ok(matchesQuery(item, "  "));
      assert.equal(matchesQuery(item, "不存在的星座xyz"), false);
    }
  });

  it("searches HYG and available HIP identifiers without dropping proper names", () => {
    const sirius = STARS.find(star => star.latinName === "Sirius")!;
    assert.ok(matchesQuery(sirius, "天狼"));
    assert.ok(matchesQuery(sirius, " sirius "));
    assert.ok(matchesQuery(sirius, `HYG ${sirius.id}`));
    assert.equal(sirius.hip, 32349);
    assert.ok(matchesQuery(sirius, "HIP 32349"));
    const withHip = { ...sirius, hip: 32349 };
    assert.ok(matchesQuery(withHip, "HIP32349"));
    assert.ok(matchesQuery(withHip, "ｈｉｐ ３２３４９"));
    assert.equal(matchesQuery(withHip, "HIP 999999"), false);
  });

  it("honours authoritative membership even when a neighbouring star appears in a constellation drawing", () => {
    const andromeda = CONSTELLATIONS.find(item => item.id === "And")!;
    const pegasus = CONSTELLATIONS.find(item => item.id === "Peg")!;
    const alpheratz = STARS.find(star => star.latinName === "Alpheratz")!;
    assert.ok(constellationStars(andromeda, STARS).some(star => star.id === alpheratz.id));
    assert.equal(constellationStars(pegasus, STARS).some(star => star.id === alpheratz.id), false);
    for (const item of CONSTELLATIONS) {
      const members = constellationStars(item, STARS);
      assert.ok(members.every(star => star.constellation === item.id));
      assert.ok(members.every((star, index) => index === 0 || members[index - 1].magnitude <= star.magnitude));
    }
  });

  it("supports legacy star positions across RA zero and near poles without claiming unrelated stars", () => {
    const base = CONSTELLATIONS[0];
    const star = { ...STARS[0], constellation: undefined, ra: 359.99, dec: 0 };
    const figure = { ...base, lines: [[[0.01, 0], [1, 0]]] as [number, number][][] };
    assert.equal(constellationStars(figure, [star]).length, 1);
    assert.equal(constellationStars(figure, [{ ...star, ra: 0.2 }]).length, 0);
    assert.equal(constellationStars({ ...figure, lines: [[[90, 89.99], [0, 88]]] }, [{ ...star, ra: 0, dec: 89.99 }]).length, 1);
    assert.deepEqual(constellationStars(figure, []), []);
  });

  it("shows only line-figure stars while retaining Alpheratz and Elnath as borrowed drawing vertices", () => {
    for (const [constellationId, starName, owningId] of [["Peg", "Alpheratz", "And"], ["Aur", "Elnath", "Tau"]]) {
      const figure = CONSTELLATIONS.find(item => item.id === constellationId)!;
      const borrowed = STARS.find(star => star.latinName === starName)!;
      assert.equal(borrowed.constellation, owningId);
      assert.ok(constellationFigureStars(figure, STARS).some(star => star.id === borrowed.id));
      assert.equal(constellationStars(figure, STARS).some(star => star.id === borrowed.id), false);
    }
    const orion = CONSTELLATIONS.find(item => item.id === "Ori")!;
    const members = constellationStars(orion, STARS);
    const figureStars = constellationFigureStars(orion, STARS);
    assert.ok(figureStars.length > 5 && figureStars.length < members.length);
    assert.equal(new Set(figureStars.map(star => star.id)).size, figureStars.length);
    assert.ok(figureStars.every(star => orion.lines.flat().some(([ra, dec]) => angularDistance(ra, dec, star.ra, star.dec) <= .05)));
  });

  it("matches the nearest figure vertex across RA zero and near poles, deduplicating repeated vertices", () => {
    const base = STARS[0];
    const near = { ...base, id: 900001, constellation: "And", ra: 359.99, dec: 0, magnitude: 2 };
    const brighterButFarther = { ...near, id: 900002, ra: .045, magnitude: -1 };
    const figure = { ...CONSTELLATIONS[0], id: "Peg", lines: [[[.01, 0], [.01, 0]]] as [number, number][][] };
    assert.deepEqual(constellationFigureStars(figure, [brighterButFarther, near]).map(star => star.id), [near.id]);
    assert.deepEqual(constellationFigureStars(figure, [near, brighterButFarther]).map(star => star.id), [near.id]);
    const polar = { ...near, ra: 0, dec: 89.99 };
    assert.deepEqual(constellationFigureStars({ ...figure, lines: [[[90, 89.99], [90, 89.99]]] }, [polar]), [polar]);
  });

  it("omits empty, invalid and unmatched figure positions instead of adding unrelated catalog stars", () => {
    const base = CONSTELLATIONS[0];
    assert.deepEqual(constellationFigureStars({ ...base, lines: [] }, STARS), []);
    assert.deepEqual(constellationFigureStars(base, []), []);
    const figure = { ...base, lines: [[[0, 0], [NaN, 0], [0, 91]]] as [number, number][][] };
    assert.deepEqual(constellationFigureStars(figure, [{ ...STARS[0], ra: 1, dec: 0 }, { ...STARS[0], ra: NaN, dec: 0 }, { ...STARS[0], ra: 0, dec: 91 }]), []);
  });

  it("leaves missing physical details explicitly unknown", () => {
    assert.equal(quantity(null), "未收录");
    assert.equal(quantity(NaN), "未收录");
    assert.equal(quantity(0), "0");
    assert.equal(stellarColorLabel({ ...STARS[0], temperatureK: null, colorIndex: null }), "颜色资料未收录");
    assert.equal(stellarColorLabel({ ...STARS[0], temperatureK: NaN, colorIndex: NaN }), "颜色资料未收录");
    assert.equal(stellarColorLabel({ ...STARS[0], temperatureK: null, colorIndex: 1.6 }), "偏橙红（色指数示意）");
    assert.equal(stellarColorLabel({ ...STARS[0], temperatureK: null, colorIndex: -.2 }), "偏蓝白（色指数示意）");
    assert.notEqual(stellarColorLabel({ ...STARS[0], temperatureK: 3000 }), stellarColorLabel({ ...STARS[0], temperatureK: 25000 }));
  });
});

describe("stargazing observer form validation", () => {
  it("accepts valid coordinates, local inputs, leap days and time-zone-qualified dates", () => {
    assert.deepEqual(parseObserverInputs("39.9", "116.4", "2026-09-07T20:00:00+08:00"), { latitude: 39.9, longitude: 116.4, date: "2026-09-07T12:00:00.000Z" });
    assert.ok(parseObserverInputs(" -90 ", "+180", "2024-02-29T23:59:59Z"));
    assert.ok(parseObserverInputs("90", "-180", "2000-02-29T12:30"));
    assert.ok(parseObserverInputs("0", "0", "1900-01-01T12:00Z"));
    assert.ok(parseObserverInputs("0", "0", "2100-12-31T12:00Z"));
  });

  it("rejects out-of-range or nondecimal coordinates and invalid calendar dates without silent rollover", () => {
    for (const [lat, lon] of [["", "0"], [" ", "0"], ["91", "0"], ["-90.1", "0"], ["0", "180.1"], ["0", "-181"], ["Infinity", "0"], ["0x10", "0"], ["1e2", "0"], ["0", "NaN"]]) assert.equal(parseObserverInputs(lat, lon, "2026-09-07T12:00Z"), null);
    for (const date of ["", "tomorrow", "2026-09-07", "2026-02-30T12:00", "1900-02-29T12:00Z", "2100-02-29T12:00Z", "2026-04-31T12:00Z", "2026-00-01T12:00Z", "2026-13-01T12:00Z", "2026-01-01T24:00Z", "2026-01-01T12:60Z", "2026-01-01T12:00:60Z", "1899-12-31T12:00Z", "2101-01-01T12:00Z"]) assert.equal(parseObserverInputs("0", "0", date), null, date);
  });
});

describe("stargazing whole-sky map geometry", () => {
  it("maps both poles and wraps right ascension consistently", () => {
    assert.deepEqual(atlasPoint(0, 90), { x: 1000, y: 0 });
    assert.deepEqual(atlasPoint(180, -90), { x: 500, y: 500 });
    assert.deepEqual(atlasPoint(-90, 0), atlasPoint(270, 0));
    assert.ok(Number.isNaN(atlasPoint(NaN, 0).x));
  });

  it("splits seam-crossing lines at matching declinations instead of dropping them or spanning the map", () => {
    for (const line of [[[359, 0], [1, 10]], [[1, 10], [359, 0]]] as [number, number][][]) {
      const segments = atlasLineSegments(line);
      assert.equal(segments.length, 2);
      assert.ok(segments.every(segment => Math.abs(segment.a.x - segment.b.x) < 10));
      assert.equal(segments[0].b.y, segments[1].a.y);
      assert.equal(Math.abs(segments[0].b.x - segments[1].a.x), 1000);
    }
    assert.equal(atlasLineSegments([[10, 0], [20, 0]]).length, 1);
    assert.deepEqual(atlasLineSegments([[NaN, 0], [20, 0]]), []);
  });

  it("keeps touch targets at 48 physical pixels under resizing and chooses the nearest figure", () => {
    const items = [{ id: "a", center: { x: 100, y: 100 }, segments: [] }, { id: "b", center: { x: 120, y: 100 }, segments: [] }];
    assert.equal(atlasNearestConstellation(items, { x: 119, y: 100 }, 1, false), "b");
    assert.equal(atlasNearestConstellation([items[0]], { x: 147, y: 100 }, .5, false), "a");
    assert.equal(atlasNearestConstellation([items[0]], { x: 149, y: 100 }, .5, false), null);
    assert.equal(atlasNearestConstellation(items, { x: 100, y: 100 }, 0, false), null);
    const line = [{ id: "line", center: { x: 500, y: 500 }, segments: [{ a: { x: 0, y: 0 }, b: { x: 100, y: 0 } }] }];
    assert.equal(atlasNearestConstellation(line, { x: 50, y: 10 }, 1, true), "line");
    assert.equal(atlasNearestConstellation(line, { x: 50, y: 10 }, 1, false), null);
  });
});
