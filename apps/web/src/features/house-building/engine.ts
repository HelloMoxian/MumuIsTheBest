import {
  World,
  Vec2,
  Box,
  Circle,
  Polygon,
  Settings,
  WeldJoint,
  PrismaticJoint,
  DistanceJoint,
  RevoluteJoint,
  RopeJoint,
  type Body,
  type Joint,
} from "planck";
import {
  DEPTH,
  MATERIALS,
  partMass,
  parseHouseDesign,
  WORLD,
  quakeAmplitude,
  isBeam,
  localVertices,
  type HouseDesign,
  type HousePart,
  type ExperimentSettings,
  type Point,
} from "./model";
import type { GroundRegion } from "../../../../server/src/house-building-workspace";
import { BeamJoint } from "./BeamJoint";
export const STEP = 1 / 240;
export type RuntimePart = {
  key: string;
  source: HousePart;
  body: Body;
  width: number;
  height: number;
  damaged: boolean;
  utilization: number;
  overload: number;
  vertices?: Point[];
};
type Link = {
  id: string;
  joint: Joint;
  internal: boolean;
  limitForce: number;
  limitMoment: number;
  a: RuntimePart;
  b?: RuntimePart;
  overload: number;
  broken: boolean;
  utilization: number;
  kind: "fixed" | "hinge" | "chain";
};
export type SimulationSnapshot = {
  time: number;
  pieces: {
    key: string;
    beamPrevious?: string;
    id: string;
    shape: string;
    material: HousePart["material"];
    x: number;
    y: number;
    angle: number;
    width: number;
    height: number;
    damaged: boolean;
    utilization: number;
    vertices?: Point[];
    supported?: boolean;
    mass: number;
  }[];
  links: {
    id: string;
    kind: string;
    a: Point;
    b: Point;
    broken: boolean;
    utilization: number;
  }[];
  ground: Point;
  groundLoad: number;
  groundUtilization: number;
  settling: boolean;
  mass: number;
  center: Point;
  maxSpeed: number;
  windForce: number;
  events: string[];
  groundAcceleration: number;
  ambientWindSpeed?: number;
  windTravel?: number;
};
export function dragForce(speed: number, area: number, coefficient = 1.2) {
  return 0.5 * 1.225 * coefficient * area * speed * Math.abs(speed);
}
/** EI/l rotational spring. Engine uses reduced rotational inertia for frequency conversion. */
export function beamStiffness(p: HousePart, length: number) {
  return (
    (MATERIALS[p.material].youngModulus * p.stiffness * DEPTH * p.height ** 3) /
    12 /
    length
  );
}
/** Inset polygon cores so Planck's collision skin fits inside the drawn outline. */
function collisionPolygon(vertices: Point[]) {
  const radius = Settings.polygonRadius;
  const center = {
    x: vertices.reduce((s, p) => s + p.x, 0) / vertices.length,
    y: vertices.reduce((s, p) => s + p.y, 0) / vertices.length,
  };
  const planes = vertices.map((p, i) => {
    const q = vertices[(i + 1) % vertices.length],
      length = Math.hypot(q.x - p.x, q.y - p.y);
    const nx = -(q.y - p.y) / length,
      ny = (q.x - p.x) / length;
    return { nx, ny, d: nx * p.x + ny * p.y };
  });
  const inset = Math.min(
    radius,
    ...planes.map((p) => (p.nx * center.x + p.ny * center.y - p.d) * 0.8),
  );
  let core = vertices.map((p) => ({ ...p }));
  for (const plane of planes) {
    const next: Point[] = [];
    for (let i = 0; i < core.length; i++) {
      const a = core[i],
        b = core[(i + 1) % core.length];
      const da = plane.nx * a.x + plane.ny * a.y - plane.d - inset,
        db = plane.nx * b.x + plane.ny * b.y - plane.d - inset;
      if (da >= 0) next.push(a);
      if (da >= 0 !== db >= 0) {
        const t = da / (da - db);
        next.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
    }
    core = next;
  }
  return new Polygon(core);
}
export class HouseSimulation {
  readonly world = new World({
    gravity: new Vec2(0, -9.81),
    allowSleep: false,
  });
  readonly ground: Body;
  readonly pieces: RuntimePart[] = [];
  readonly links: Link[] = [];
  settings: ExperimentSettings;
  time = 0;
  wind = false;
  quake = false;
  groundLoad = 0;
  groundUtilization = 0;
  windForce = 0;
  settling = false;
  readonly events: string[] = [];
  private loads = new Map<Body, number[]>();
  private groundOverload = 0;
  private phase = 0;
  private amplitude = 0;
  private frequency = 1.5;
  private groundDepth = 0;
  private warmup = 1.5;
  groundAcceleration = 0;
  ambientWindSpeed = 0;
  windTravel = 0;
  constructor(
    design: HouseDesign,
    options: { regions?: GroundRegion[]; warmup?: number } = {},
  ) {
    const parsed = parseHouseDesign(design);
    if (!parsed)
      throw new Error("搭建方案不完整，或有积木重叠。请回到搭建检查。");
    this.settings = { ...parsed.settings };
    this.warmup = options.warmup ?? 1.5;
    this.frequency = this.settings.quakeFrequency;
    this.ground = this.world.createKinematicBody(new Vec2(0, -0.25));
    for (const r of options.regions ?? [
      { left: WORLD.left - 2, right: WORLD.right + 2 },
    ])
      this.ground.createFixture(
        new Box(
          (r.right - r.left) / 2 - Settings.polygonRadius,
          0.25 - Settings.polygonRadius,
          new Vec2((r.left + r.right) / 2, 0),
        ),
        { friction: 1.4 },
      );
    const groups = new Map<string, RuntimePart[]>();
    for (const original of parsed.parts) {
      // Segment rectangles along their long axis, preserving the same world outline.
      const cushion =
        original.material.startsWith("cushion_") &&
        ["block", "rectangle", "bar"].includes(original.shape);
      const p = cushion
        ? {
            ...original,
            width: original.height,
            height: original.width,
            angle: original.angle + Math.PI / 2,
          }
        : original.shape === "rectangle" && original.height > original.width
          ? {
              ...original,
              width: original.height,
              height: original.width,
              angle: original.angle + Math.PI / 2,
            }
          : original;
      const n = cushion
        ? 2
        : isBeam(p)
          ? Math.min(12, Math.max(3, Math.ceil(p.width / 0.5)))
          : 1;
      const group: RuntimePart[] = [];
      for (let i = 0; i < n; i++) {
        const dx = -p.width / 2 + ((i + 0.5) * p.width) / n;
        const pos = {
          x: p.x + dx * Math.cos(p.angle),
          y: p.y + dx * Math.sin(p.angle),
        };
        const piece = this.createPiece(
          p,
          p.id + ":" + i,
          pos,
          p.angle,
          p.width / n,
          p.height,
          partMass(p) / n,
          false,
          p.shape === "triangle" ? localVertices(p) : undefined,
        );
        group.push(piece);
        if (i > 0) {
          const a = group[i - 1],
            b = piece;
          const anchor = new Vec2(
            p.x + (-p.width / 2 + (i * p.width) / n) * Math.cos(p.angle),
            p.y + (-p.width / 2 + (i * p.width) / n) * Math.sin(p.angle),
          );
          const inertia =
            1 / (1 / a.body.getInertia() + 1 / b.body.getInertia());
          const hz =
            Math.sqrt(beamStiffness(p, p.width / n) / inertia) / (2 * Math.PI);
          if (cushion) {
            this.world.createJoint(
              new PrismaticJoint(
                {
                  enableLimit: true,
                  lowerTranslation: -original.height * 0.35,
                  upperTranslation: 0,
                  collideConnected: false,
                },
                a.body,
                b.body,
                new Vec2(p.x, p.y),
                new Vec2(Math.cos(p.angle), Math.sin(p.angle)),
              ),
            );
          }
          const springHz =
            Math.sqrt(
              (MATERIALS[p.material].youngModulus *
                p.stiffness *
                DEPTH *
                original.width) /
                original.height /
                (partMass(p) / 4),
            ) /
            (2 * Math.PI);
          const joint = this.world.createJoint(
            cushion
              ? new DistanceJoint(
                  {
                    frequencyHz: springHz,
                    dampingRatio: 1,
                    collideConnected: false,
                  },
                  a.body,
                  b.body,
                  a.body.getPosition(),
                  b.body.getPosition(),
                )
              : new BeamJoint(
                  { frequencyHz: hz, dampingRatio: 0.2 },
                  a.body,
                  b.body,
                  anchor,
                ),
          )!;
          this.links.push({
            id: p.id + ":beam:" + i,
            joint,
            internal: true,
            limitForce: cushion
              ? Infinity
              : MATERIALS[p.material].compressiveStrength *
                p.strength *
                DEPTH *
                p.height,
            limitMoment: cushion
              ? Infinity
              : (MATERIALS[p.material].bendingStrength *
                  p.strength *
                  DEPTH *
                  p.height ** 2) /
                6,
            a,
            b,
            overload: 0,
            broken: false,
            utilization: 0,
            kind: "fixed",
          });
        }
      }
      groups.set(p.id, group);
    }
    const closest = (id: string, p: Point) =>
      groups
        .get(id)!
        .reduce((a, b) =>
          Vec2.distance(a.body.getPosition(), p) <
          Vec2.distance(b.body.getPosition(), p)
            ? a
            : b,
        );
    for (const c of parsed.connections) {
      const a = closest(c.a, c.anchor),
        b =
          c.b === "ground"
            ? undefined
            : closest(
                c.b,
                c.kind === "chain"
                  ? parsed.parts.find((p) => p.id === c.b)!
                  : c.anchor,
              );
      const other = b?.body ?? this.ground;
      const joint =
        c.kind === "chain"
          ? this.world.createJoint(
              new RopeJoint({
                bodyA: a.body,
                bodyB: other,
                collideConnected: true,
                localAnchorA: a.body.getLocalPoint(c.anchor),
                localAnchorB: other.getLocalPoint(
                  parsed.parts.find((p) => p.id === c.b)!,
                ),
                maxLength: Vec2.distance(
                  c.anchor,
                  parsed.parts.find((p) => p.id === c.b)!,
                ),
              }),
            )!
          : c.kind === "hinge"
            ? this.world.createJoint(
                new RevoluteJoint(
                  { collideConnected: false },
                  a.body,
                  other,
                  c.anchor,
                ),
              )!
            : this.world.createJoint(
                new WeldJoint(
                  { frequencyHz: 0, collideConnected: false },
                  a.body,
                  other,
                  c.anchor,
                ),
              )!;
      this.links.push({
        id: c.id,
        joint,
        internal: false,
        limitForce: c.strength,
        limitMoment: c.kind === "chain" ? Infinity : c.strength * 0.2,
        a,
        b,
        overload: 0,
        broken: false,
        utilization: 0,
        kind: c.kind,
      });
    }
    // Planck mixes restitution using max: a buffer must also absorb contact
    // with a bouncy object, not inherit the other fixture's rebound.
    this.world.on("pre-solve", (contact) => {
      const bodies = [
        contact.getFixtureA().getBody(),
        contact.getFixtureB().getBody(),
      ];
      if (
        this.pieces.some(
          (p) =>
            p.source.material.startsWith("cushion_") && bodies.includes(p.body),
        )
      )
        contact.setRestitution(0);
    });
    this.world.on("post-solve", (contact, impulse) => {
      const m = contact.getWorldManifold(null);
      if (!m) return;
      const force = impulse.normalImpulses.reduce((a, b) => a + b, 0) / STEP;
      const a = contact.getFixtureA().getBody(),
        b = contact.getFixtureB().getBody();
      for (const [body, sign] of [
        [a, -1],
        [b, 1],
      ] as const) {
        if (body === this.ground) {
          this.groundLoad += Math.max(0, -m.normal.y * sign * force);
          continue;
        }
        const local = body.getLocalVector(
          new Vec2(m.normal.x * sign, m.normal.y * sign),
        );
        const list = this.loads.get(body) ?? [0, 0, 0, 0];
        list[local.x >= 0 ? 0 : 1] += Math.abs(local.x) * force;
        list[local.y >= 0 ? 2 : 3] += Math.abs(local.y) * force;
        this.loads.set(body, list);
      }
    });
  }
  private createPiece(
    source: HousePart,
    key: string,
    p: Point,
    angle: number,
    width: number,
    height: number,
    mass: number,
    damaged = false,
    vertices?: Point[],
  ) {
    const body = this.world.createDynamicBody({
      position: p,
      angle,
      bullet: true,
      angularDamping: 0.015,
    });
    const circle = source.shape === "circle" && !damaged;
    const area = vertices
      ? Math.abs(
          vertices.reduce((sum, v, i) => {
            const n = vertices[(i + 1) % vertices.length];
            return sum + v.x * n.y - n.x * v.y;
          }, 0),
        ) / 2
      : circle
        ? Math.PI * (width / 2) ** 2
        : width * height;
    const mat = MATERIALS[source.material];
    const outline = vertices
      ? new Polygon(vertices)
      : circle
        ? new Circle(width / 2)
        : new Box(width / 2, height / 2);
    const collider = circle
      ? outline
      : vertices
        ? collisionPolygon(vertices)
        : new Box(
            width / 2 - Settings.polygonRadius,
            height / 2 - Settings.polygonRadius,
          );
    body.createFixture(collider, {
      density: mass / area,
      friction: mat.friction,
      restitution: mat.restitution,
    });
    // Collision skin is numerical, not missing material. Preserve original mass,
    // centroid and inertia for beam mechanics and fracture conservation.
    const massData = { mass: 0, center: new Vec2(), I: 0 };
    outline.computeMass(massData, mass / area);
    body.setMassData(massData);
    const piece = {
      key,
      source,
      body,
      width,
      height,
      damaged,
      utilization: 0,
      overload: 0,
      vertices,
    };
    this.pieces.push(piece);
    return piece;
  }
  private report(message: string) {
    if (this.events[this.events.length - 1] !== message)
      this.events.push(message);
    if (this.events.length > 8) this.events.shift();
  }
  private breakLink(link: Link, message: string) {
    if (link.broken) return;
    link.broken = true;
    this.world.destroyJoint(link.joint);
    if (link.internal) {
      link.a.damaged = true;
      if (link.b) link.b.damaged = true;
    }
    this.report(message);
  }
  private fracture(piece: RuntimePart) {
    for (const link of this.links)
      if (!link.broken && (link.a === piece || link.b === piece))
        this.breakLink(link, "构件损坏，连接已松开");
    const p = piece.body.getPosition().clone(),
      angle = piece.body.getAngle();
    const mass = piece.body.getMass(),
      omega = piece.body.getAngularVelocity(),
      inertia = piece.body.getInertia();
    const velocity = piece.body.getLinearVelocity().clone();
    this.world.destroyBody(piece.body);
    this.pieces.splice(this.pieces.indexOf(piece), 1);
    // Four non-overlapping fragments preserve total mass, centre of mass and rigid velocity field.
    for (let i = 0; i < 4; i++) {
      let dx = ((i % 2 === 0 ? -1 : 1) * piece.width) / 4,
        dy = ((i < 2 ? -1 : 1) * piece.height) / 4;
      let vertices: Point[] | undefined;
      if (piece.source.shape === "triangle") {
        const [a, b, c] = localVertices(piece.source);
        const mid = (p: Point, q: Point) => ({
          x: (p.x + q.x) / 2,
          y: (p.y + q.y) / 2,
        });
        const ab = mid(a, b),
          bc = mid(b, c),
          ca = mid(c, a);
        const triangle = [
          [a, ab, ca],
          [ab, b, bc],
          [ca, bc, c],
          [ab, bc, ca],
        ][i];
        dx = triangle.reduce((n, v) => n + v.x, 0) / 3;
        dy = triangle.reduce((n, v) => n + v.y, 0) / 3;
        vertices = triangle.map((v) => ({ x: v.x - dx, y: v.y - dy }));
      } else if (piece.source.shape === "circle") {
        const r = piece.width / 2;
        const sector = [
          { x: 0, y: 0 },
          ...Array.from({ length: 7 }, (_, j) => ({
            x: r * Math.cos((i * Math.PI) / 2 + (j * Math.PI) / 12),
            y: r * Math.sin((i * Math.PI) / 2 + (j * Math.PI) / 12),
          })),
        ];
        let area2 = 0,
          cx = 0,
          cy = 0;
        for (let j = 0; j < sector.length; j++) {
          const a = sector[j],
            b = sector[(j + 1) % sector.length],
            cross = a.x * b.y - b.x * a.y;
          area2 += cross;
          cx += (a.x + b.x) * cross;
          cy += (a.y + b.y) * cross;
        }
        dx = cx / (3 * area2);
        dy = cy / (3 * area2);
        vertices = sector.map((v) => ({ x: v.x - dx, y: v.y - dy }));
      }
      const rx = dx * Math.cos(angle) - dy * Math.sin(angle),
        ry = dx * Math.sin(angle) + dy * Math.cos(angle);
      const f = this.createPiece(
        piece.source,
        piece.key + ":f" + i,
        { x: p.x + rx, y: p.y + ry },
        angle,
        piece.width / 2,
        piece.height / 2,
        mass / 4,
        true,
        vertices,
      );
      if (vertices && piece.source.shape === "circle")
        f.body.setMassData({
          mass: mass / 4,
          center: new Vec2(0, 0),
          I: inertia / 4 - (mass / 4) * (dx * dx + dy * dy),
        });
      f.body.setLinearVelocity(
        new Vec2(velocity.x - omega * ry, velocity.y + omega * rx),
      );
      f.body.setAngularVelocity(omega);
    }
    this.report("有构件受压超载，碎块仍保留原来的总重量");
  }
  step(count = 1) {
    for (let iteration = 0; iteration < count; iteration++) {
      this.loads.clear();
      this.groundLoad = 0;
      this.windForce = 0;
      const ready = this.time >= this.warmup;
      const amplitude = this.quake && ready ? quakeAmplitude(this.settings) : 0;
      this.amplitude += (amplitude - this.amplitude) * Math.min(1, STEP / 0.8);
      this.frequency +=
        (this.settings.quakeFrequency - this.frequency) *
        Math.min(1, STEP / 0.8);
      this.phase += 2 * Math.PI * this.frequency * STEP;
      const nextX = this.amplitude * Math.sin(this.phase);
      if (this.settling)
        this.groundDepth = Math.min(0.8, this.groundDepth + 0.16 * STEP);
      const previousVelocity = this.ground.getLinearVelocity().x;
      this.ground.setLinearVelocity(
        new Vec2(
          (nextX - this.ground.getPosition().x) / STEP,
          (-0.25 - this.groundDepth - this.ground.getPosition().y) / STEP,
        ),
      );
      this.groundAcceleration =
        (this.ground.getLinearVelocity().x - previousVelocity) / STEP;
      this.ambientWindSpeed =
        this.wind && ready
          ? this.settings.windSpeed *
            (this.settings.gusts ? 0.75 + 0.25 * Math.sin(this.time * 2.1) : 1)
          : 0;
      this.windTravel +=
        this.ambientWindSpeed * this.settings.windDirection * STEP;
      if (this.ambientWindSpeed > 0) this.applyWind();
      const hasBeams = this.links.some((link) => link.internal && !link.broken);
      this.world.step(STEP, hasBeams ? 48 : 24, hasBeams ? 24 : 12);
      this.time += STEP;
      const utilizations = new Map<Body, number>();
      for (const link of this.links) {
        if (link.broken) continue;
        const f = link.joint.getReactionForce(1 / STEP);
        const moment = Math.abs(link.joint.getReactionTorque(1 / STEP));
        link.utilization = Math.max(
          f.length() / link.limitForce,
          moment / link.limitMoment,
        );
        utilizations.set(
          link.a.body,
          Math.max(utilizations.get(link.a.body) ?? 0, link.utilization),
        );
        if (link.b)
          utilizations.set(
            link.b.body,
            Math.max(utilizations.get(link.b.body) ?? 0, link.utilization),
          );
        link.overload =
          link.utilization > 1
            ? link.overload + STEP
            : Math.max(0, link.overload - 2 * STEP);
        if (!link.b) this.groundLoad += Math.max(0, -f.y);
        // Joint tractions matter as much as contact forces for anchored structures.
        for (const [piece, sign] of [
          [link.a, -1],
          [link.b, 1],
        ] as const) {
          if (!piece) continue;
          const local = piece.body.getLocalVector(
            new Vec2(f.x * sign, f.y * sign),
          );
          const anchor = piece.body.getLocalPoint(
            piece === link.a
              ? link.joint.getAnchorA()
              : link.joint.getAnchorB(),
          );
          if (local.x * anchor.x + local.y * anchor.y > 0.000001) continue; // Tension is not crushing.
          const list = this.loads.get(piece.body) ?? [0, 0, 0, 0];
          list[local.x >= 0 ? 0 : 1] += Math.abs(local.x);
          list[local.y >= 0 ? 2 : 3] += Math.abs(local.y);
          this.loads.set(piece.body, list);
        }
        if (
          link.kind === "chain" ? link.utilization > 1 : link.overload >= 0.08
        )
          this.breakLink(
            link,
            link.internal
              ? "长条弯曲或受力过大，发生断裂"
              : "连接受力过大，已经断开",
          );
      }
      for (const piece of [...this.pieces]) {
        const force = this.loads.get(piece.body) ?? [0, 0, 0, 0];
        const stress = Math.max(
          Math.max(force[0], force[1]) / (DEPTH * piece.height),
          Math.max(force[2], force[3]) / (DEPTH * piece.width),
        );
        const ratio =
          stress /
          (MATERIALS[piece.source.material].compressiveStrength *
            piece.source.strength);
        const linkRatio = utilizations.get(piece.body) ?? 0;
        piece.utilization +=
          (Math.max(ratio, linkRatio) - piece.utilization) *
          Math.min(1, STEP / 0.08);
        piece.overload =
          ratio > 1
            ? piece.overload + STEP
            : Math.max(0, piece.overload - 2 * STEP);
        if (
          piece.overload >= 0.12 &&
          !piece.damaged &&
          piece.source.shape !== "weight"
        )
          this.fracture(piece);
        const p = piece.body.getPosition();
        if (
          !Number.isFinite(p.x + p.y + piece.body.getAngle()) ||
          Math.abs(p.x) > 200 ||
          Math.abs(p.y) > 200
        )
          throw new Error("积木离开了实验范围，请回到搭建调整后再试。");
      }
      this.groundUtilization +=
        (this.groundLoad / this.settings.groundCapacity -
          this.groundUtilization) *
        Math.min(1, STEP / 0.1);
      this.groundOverload =
        this.groundUtilization > 1 ? this.groundOverload + STEP : 0;
      if (this.groundOverload > 0.3 && !this.settling) {
        this.settling = true;
        this.report("地基承载不足，正在下沉");
      }
    }
  }
  private applyWind() {
    const direction = this.settings.windDirection;
    const speed = this.ambientWindSpeed;
    // Horizontal ray strips: only the first surface receives wind pressure. No hidden-body double loading.
    const strip = 0.1;
    const top = Math.min(
      WORLD.top + 5,
      Math.max(
        1,
        ...this.pieces.map(
          (p) => p.body.getPosition().y + Math.max(p.width, p.height) / 2,
        ),
      ),
    );
    for (let y = -0.6; y < top; y += strip) {
      let target: Body | undefined,
        hit: Point | undefined,
        normal: Point | undefined;
      this.world.rayCast(
        new Vec2(-(WORLD.right + 5) * direction, y),
        new Vec2((WORLD.right + 5) * direction, y),
        (fixture, point, n, fraction) => {
          if (fixture.getBody() === this.ground) return -1;
          target = fixture.getBody();
          hit = { ...point };
          normal = { ...n };
          return fraction;
        },
      );
      if (!target || !hit || !normal) continue;
      const velocity = target.getLinearVelocityFromWorldPoint(hit);
      const relative = direction * speed - velocity.x;
      const force = dragForce(relative, strip * DEPTH) * Math.abs(normal.x);
      target.applyForce(new Vec2(force, 0), hit, true);
      this.windForce += Math.abs(force);
    }
  }
  snapshot(): SimulationSnapshot {
    const adjacency = new Map<Body, Body[]>();
    const connect = (a: Body, b: Body) => {
      adjacency.set(a, [...(adjacency.get(a) ?? []), b]);
      adjacency.set(b, [...(adjacency.get(b) ?? []), a]);
    };
    for (let c = this.world.getContactList(); c; c = c.getNext())
      if (c.isTouching())
        connect(c.getFixtureA().getBody(), c.getFixtureB().getBody());
    for (const l of this.links)
      if (!l.broken) connect(l.a.body, l.b?.body ?? this.ground);
    const supported = new Set<Body>([this.ground]),
      queue = [this.ground];
    for (let i = 0; i < queue.length; i++)
      for (const b of adjacency.get(queue[i]) ?? [])
        if (!supported.has(b)) {
          supported.add(b);
          queue.push(b);
        }
    let mass = 0,
      x = 0,
      y = 0,
      maxSpeed = 0;
    for (const p of this.pieces) {
      const m = p.body.getMass(),
        pos = p.body.getPosition();
      mass += m;
      x += m * pos.x;
      y += m * pos.y;
      maxSpeed = Math.max(maxSpeed, p.body.getLinearVelocity().length());
    }
    const beamPrevious = new Map(
      this.links
        .filter((l) => l.internal && !l.broken && l.b)
        .map((l) => [l.b!.key, l.a.key]),
    );
    return {
      time: this.time,
      pieces: this.pieces.map((p) => ({
        key: p.key,
        beamPrevious: beamPrevious.get(p.key),
        id: p.source.id,
        shape: p.damaged ? "block" : p.source.shape,
        material: p.source.material,
        mass: p.body.getMass(),
        ...p.body.getPosition(),
        angle: p.body.getAngle(),
        width: p.width,
        height: p.height,
        damaged: p.damaged,
        utilization: p.utilization,
        vertices: p.vertices,
        supported: supported.has(p.body),
      })),
      links: this.links
        .filter((l) => !l.internal && !l.broken)
        .map((l) => ({
          id: l.id,
          kind: l.kind,
          a: { ...l.joint.getAnchorA() },
          b: { ...l.joint.getAnchorB() },
          broken: l.broken,
          utilization: l.utilization,
        })),
      ground: {
        x: this.ground.getPosition().x,
        y: this.ground.getPosition().y + 0.25,
      },
      groundLoad: this.groundLoad,
      groundUtilization: this.groundUtilization,
      settling: this.settling,
      mass,
      center: { x: mass ? x / mass : 0, y: mass ? y / mass : 0 },
      maxSpeed,
      windForce: this.windForce,
      events: [...this.events],
      groundAcceleration: this.groundAcceleration,
      ambientWindSpeed: this.ambientWindSpeed,
      windTravel: this.windTravel,
    };
  }
}
