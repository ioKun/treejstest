import { state } from "../state.js";
import {
  LAYER_NON_MOVING,
  LAYER_MOVING,
  PIT_CENTER_X,
  PIT_CENTER_Z,
  PIT_HALF_X,
  PIT_HALF_Z,
  PIT_WALL_THICKNESS,
  PIT_DEPTH,
  SHREDDER_SHAFT_AXIS_Y,
  SHREDDER_SHAFT_OFFSET_Z,
  SHREDDER_DISC_RADIUS,
  SHREDDER_DISC_HALF_HEIGHT,
  SHREDDER_DISC_PITCH,
  SHREDDER_DISC_COUNT,
  SHREDDER_DISC_FRICTION,
  SHREDDER_OMEGA,
} from "../constants.js";

function createStaticBox(cx, y, cz, hx, hy, hz, friction) {
  const J = state.J;
  const shape = new J.BoxShape(new J.Vec3(hx, hy, hz), 0.02);
  const position = new J.RVec3(cx, y, cz);
  const rotation = new J.Quat(0, 0, 0, 1);
  const settings = new J.BodyCreationSettings(
    shape,
    position,
    rotation,
    J.EMotionType_Static,
    LAYER_NON_MOVING
  );
  settings.mFriction = friction;
  settings.mRestitution = 0;

  const body = state.bodyInterface.CreateBody(settings);
  J.destroy(settings);
  J.destroy(position);
  J.destroy(rotation);
  state.bodyInterface.AddBody(body.GetID(), J.EActivation_Activate);
}

export function buildShredderPhysics() {
  const J = state.J;
  const hy = PIT_DEPTH / 2;

  const wallX = PIT_HALF_X + PIT_WALL_THICKNESS / 2;
  const wallZ = PIT_HALF_Z + PIT_WALL_THICKNESS / 2;

  createStaticBox(
    PIT_CENTER_X,
    -hy,
    PIT_CENTER_Z - wallZ,
    wallX + PIT_WALL_THICKNESS,
    hy,
    PIT_WALL_THICKNESS / 2,
    0.7
  );
  createStaticBox(
    PIT_CENTER_X,
    -hy,
    PIT_CENTER_Z + wallZ,
    wallX + PIT_WALL_THICKNESS,
    hy,
    PIT_WALL_THICKNESS / 2,
    0.7
  );
  createStaticBox(
    PIT_CENTER_X - wallX,
    -hy,
    PIT_CENTER_Z,
    PIT_WALL_THICKNESS / 2,
    hy,
    PIT_HALF_Z,
    0.7
  );
  createStaticBox(
    PIT_CENTER_X + wallX,
    -hy,
    PIT_CENTER_Z,
    PIT_WALL_THICKNESS / 2,
    hy,
    PIT_HALF_Z,
    0.7
  );
  createStaticBox(
    PIT_CENTER_X,
    -PIT_DEPTH - 0.1,
    PIT_CENTER_Z,
    wallX,
    0.1,
    wallZ,
    0.9
  );

  const discShape = new J.CylinderShape(
    SHREDDER_DISC_HALF_HEIGHT,
    SHREDDER_DISC_RADIUS,
    0.02
  );
  const discRotation = J.Quat.prototype.sRotation(
    new J.Vec3(0, 0, 1),
    -Math.PI / 2
  );

  const shafts = [];

  for (const side of [-1, 1]) {
    for (let i = 0; i < SHREDDER_DISC_COUNT; i++) {
      const x = PIT_CENTER_X + (i - (SHREDDER_DISC_COUNT - 1) / 2) * SHREDDER_DISC_PITCH;
      const z = PIT_CENTER_Z + side * SHREDDER_SHAFT_OFFSET_Z;

      const position = new J.RVec3(x, SHREDDER_SHAFT_AXIS_Y, z);
      const settings = new J.BodyCreationSettings(
        discShape,
        position,
        discRotation,
        J.EMotionType_Kinematic,
        LAYER_MOVING
      );
      settings.mFriction = SHREDDER_DISC_FRICTION;
      settings.mRestitution = 0;

      const body = state.bodyInterface.CreateBody(settings);
      J.destroy(settings);
      J.destroy(position);
      state.bodyInterface.AddBody(body.GetID(), J.EActivation_Activate);

      shafts.push({
        id: body.GetID(),
        omega: side > 0 ? -SHREDDER_OMEGA : SHREDDER_OMEGA,
      });
    }
  }

  J.destroy(discRotation);

  state.shredder.shafts = shafts;
}

export function updateShredderShafts() {
  const shafts = state.shredder.shafts;
  const omega = state.tmpVec3b;

  for (const shaft of shafts) {
    omega.Set(shaft.omega, 0, 0);
    state.bodyInterface.SetAngularVelocity(shaft.id, omega);
  }
}
