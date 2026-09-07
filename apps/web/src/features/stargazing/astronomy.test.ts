import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  angularDistance, colorForStar, constellationView, equatorialToHorizontal,
  formatRa, horizontalToEquatorial, localSiderealTime, makeSkyProjection,
  normalizedSkyView, projectEquatorial, temperatureToColor, unprojectEquatorial,
} from "./astronomy";
import type { Constellation, SkyObserver } from "./types";

const greenwich: SkyObserver = { latitude: 0, longitude: 0, date: "2000-01-01T12:00:00Z" };
function near(actual: number, expected: number, tolerance = 0.00001) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `Expected ${actual} within ${tolerance} of ${expected}`);
}
function constellation(lines: [number, number][][]): Constellation {
  return { id: "test", name: "测试星座", latinName: "Test", ra: 0, dec: 0, area: 100, rank: 1, season: "winter", zodiac: false, description: "", lines, sourceUrls: [] };
}
function rgb(color: string) {
  return [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16));
}

describe("stargazing spherical navigation", () => {
  it("wraps right ascension and safely bounds extreme or invalid views", () => {
    assert.deepEqual(normalizedSkyView({ ra: -1, dec: 120, fov: 1 }), { ra: 359, dec: 90, fov: 15 });
    assert.deepEqual(normalizedSkyView({ ra: 721, dec: -120, fov: 360 }), { ra: 1, dec: -90, fov: 160 });
    assert.deepEqual(normalizedSkyView({ ra: NaN, dec: Infinity, fov: NaN }), { ra: 0, dec: 0, fov: 110 });
    assert.equal(formatRa(359.9999), "00时00分");
    assert.equal(formatRa(-15), "23时00分");
    assert.equal(formatRa(83.5), "05时34分");
  });

  it("projects celestial east to the left and crosses RA zero continuously", () => {
    const projection = makeSkyProjection({ ra: 0, dec: 0, fov: 110 }, 1_000, 800);
    const center = projectEquatorial(0, 0, projection)!;
    const east = projectEquatorial(1, 0, projection)!;
    const west = projectEquatorial(359, 0, projection)!;
    near(center.x, 500);
    near(center.y, 400);
    near(500 - east.x, west.x - 500);
    assert.ok(east.x < 500 && west.x > 500);
    assert.ok(projectEquatorial(0, 1, projection)!.y < 400);
    assert.equal(projectEquatorial(180, 0, projection), null);
  });

  it("round trips stereographic positions in narrow, wide, portrait and polar views", () => {
    for (const view of [{ ra: 359, dec: 0, fov: 160 }, { ra: 83, dec: -30, fov: 15 }, { ra: 130, dec: 90, fov: 100 }, { ra: 15, dec: -90, fov: 100 }]) {
      for (const [width, height] of [[1_200, 800], [390, 844]]) {
        const projection = makeSkyProjection(view, width, height);
        for (const [x, y] of [[width / 2, height / 2], [40, 60], [width - 25, height - 30]]) {
          const coordinate = unprojectEquatorial(x, y, projection);
          const point = projectEquatorial(coordinate.ra, coordinate.dec, projection)!;
          assert.ok(point);
          near(point.x, x);
          near(point.y, y);
        }
      }
    }
  });

  it("rejects invalid celestial points and keeps zero-size canvases mathematically usable", () => {
    const projection = makeSkyProjection({ ra: 0, dec: 0, fov: 110 }, 0, NaN);
    assert.ok(Number.isFinite(projection.scale) && projection.scale > 0);
    assert.equal(projectEquatorial(NaN, 0, projection), null);
    assert.equal(projectEquatorial(0, 91, projection), null);
  });

  it("frames constellations that straddle RA zero without zooming out to the whole sky", () => {
    const figure = constellation([[[350, 5], [0, -5], [10, 5]]]);
    const view = constellationView(figure);
    assert.ok(view.ra < 1 || view.ra > 359);
    assert.ok(view.fov < 50 && view.fov > 25);
    for (const [ra, dec] of figure.lines.flat()) assert.ok(angularDistance(view.ra, view.dec, ra, dec) < view.fov / 2);
  });

  it("frames polar constellations and falls back for an empty figure", () => {
    const figure = constellation([[[0, 85], [90, 85], [180, 85], [270, 85]]]);
    const view = constellationView(figure);
    assert.ok(view.dec > 89.99);
    assert.ok(view.fov < 30);
    assert.deepEqual(constellationView({ ...constellation([]), ra: 15, dec: -20 }), { ra: 15, dec: -20, fov: 45 });
  });
});

describe("stargazing local geometric sky", () => {
  it("agrees with the USNO J2000 reference sidereal angle", () => {
    near(localSiderealTime(greenwich), 280.460625, 0.0001);
    const zenith = equatorialToHorizontal(280.460625, 0, greenwich);
    near(zenith.altitude, 90, 0.0001);
    const east = equatorialToHorizontal(10.460625, 0, greenwich);
    near(east.altitude, 0, 0.0001);
    near(east.azimuth, 90, 0.0001);
    const west = equatorialToHorizontal(190.460625, 0, greenwich);
    near(west.azimuth, 270, 0.0001);
  });

  it("places celestial poles at observer latitude and handles geographic poles", () => {
    near(equatorialToHorizontal(0, 90, { ...greenwich, latitude: 40 }).altitude, 40);
    near(equatorialToHorizontal(210, 90, { ...greenwich, latitude: -35 }).altitude, -35);
    near(equatorialToHorizontal(50, 20, { ...greenwich, latitude: 90 }).altitude, 20);
    near(equatorialToHorizontal(50, 20, { ...greenwich, latitude: -90 }).altitude, -20);
  });

  it("converts horizons and equatorial positions consistently at different places and times", () => {
    for (const observer of [greenwich, { latitude: 39.9, longitude: 116.4, date: "2026-09-07T14:00:00Z" }, { latitude: -33.9, longitude: 151.2, date: "2026-12-20T09:30:00Z" }]) {
      for (const [ra, dec] of [[0, 0], [359.9, -30], [150, 89.9], [80, -89.9]]) {
        const local = equatorialToHorizontal(ra, dec, observer);
        const roundTrip = horizontalToEquatorial(local.altitude, local.azimuth, observer);
        near(angularDistance(ra, dec, roundTrip.ra, roundTrip.dec), 0, 0.00001);
      }
      for (const azimuth of [0, 90, 180, 270]) {
        const point = horizontalToEquatorial(0, azimuth, observer);
        const local = equatorialToHorizontal(point.ra, point.dec, observer);
        near(local.altitude, 0);
        near(Math.min(Math.abs(local.azimuth - azimuth), 360 - Math.abs(local.azimuth - azimuth)), 0);
      }
    }
  });

  it("does not turn invalid observer input into plausible astronomical facts", () => {
    assert.ok(Number.isNaN(localSiderealTime({ ...greenwich, date: "not-a-date" })));
    assert.ok(Number.isNaN(equatorialToHorizontal(0, 0, { ...greenwich, latitude: 91 }).altitude));
    assert.ok(Number.isNaN(equatorialToHorizontal(Infinity, 0, greenwich).azimuth));
    assert.ok(Number.isNaN(horizontalToEquatorial(0, 90, { ...greenwich, longitude: NaN }).ra));
  });
});

describe("stargazing illustrative stellar colours", () => {
  it("shows cool stars orange and hot stars blue-white, with a distinct solar colour", () => {
    const cool = rgb(temperatureToColor(3_000));
    const solar = rgb(temperatureToColor(5_772));
    const hot = rgb(temperatureToColor(25_000));
    assert.ok(cool[0] > cool[2] + 100);
    assert.ok(hot[2] > hot[0] + 50);
    assert.ok(solar[2] > cool[2] && solar[0] > hot[0]);
  });

  it("uses the same temperature colour in the sky and stellar detail, then falls back to B−V", () => {
    assert.equal(colorForStar({ temperatureK: 4_000, colorIndex: -0.2 }), temperatureToColor(4_000));
    const red = rgb(colorForStar({ temperatureK: null, colorIndex: 1.6 }));
    const blue = rgb(colorForStar({ temperatureK: null, colorIndex: -0.2 }));
    assert.ok(red[0] > red[2]);
    assert.ok(blue[2] > blue[0]);
    assert.equal(colorForStar({ temperatureK: null, colorIndex: null }), "#e6edff");
  });

  it("safely handles missing or pathological temperature and colour index values", () => {
    assert.equal(temperatureToColor(NaN), "#e6edff");
    assert.equal(temperatureToColor(-100), "#e6edff");
    assert.equal(colorForStar({ temperatureK: Infinity, colorIndex: NaN }), "#e6edff");
    for (const value of [-1e20, 0, 1e20]) assert.match(colorForStar({ temperatureK: null, colorIndex: value }), /^#[0-9a-f]{6}$/);
  });
});
