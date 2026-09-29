import {
  WeldJoint,
  type Body,
  type Vec2Value,
  type TimeStep,
  type WeldJointOpt,
} from "planck";

/**
 * EI-based beam joint. Resolved modes use Planck's angular spring. For stiff
 * sub-step modes, relax the rigid constraint toward the constitutive curvature
 * theta = -M/k instead of suppressing flexibility or exciting unresolved modes.
 * The high-frequency branch is quasi-static; it does not model ultrasound-like
 * internal vibration. Planck is pinned to 1.5.0 for the reference-angle adapter.
 */
export class BeamJoint extends WeldJoint {
  private readonly stiffness: number;
  private readonly restAngle: number;
  private readonly stiff: boolean;
  constructor(options: WeldJointOpt, a: Body, b: Body, anchor: Vec2Value) {
    const hz = options.frequencyHz ?? 0;
    super(
      { ...options, frequencyHz: hz > 60 ? 0 : hz, dampingRatio: 0.2 },
      a,
      b,
      anchor,
    );
    this.stiff = hz > 60;
    this.stiffness =
      (2 * Math.PI * hz) ** 2 / (1 / a.getInertia() + 1 / b.getInertia());
    this.restAngle = this.getReferenceAngle();
  }
  override initVelocityConstraints(step: TimeStep) {
    if (this.stiff) {
      const state = this as unknown as { m_referenceAngle: number };
      const desired =
        this.restAngle - this.getReactionTorque(1 / step.dt) / this.stiffness;
      state.m_referenceAngle +=
        (desired - state.m_referenceAngle) * Math.min(1, step.dt / 0.04);
    }
    super.initVelocityConstraints(step);
  }
  override solvePositionConstraints(step: TimeStep): boolean {
    const settled = super.solvePositionConstraints(step);
    // The engine's two-degree angular slop is larger than elastic beam bends.
    // Use the full bounded position budget instead of accepting that tolerance.
    return this.stiff ? false : settled;
  }
}
