import { state } from "../state.js";
import {
  LAYER_MOVING,
  LAYER_NON_MOVING,
  LAYER_PORTAL,
  LAYER_STUCK,
  NUM_LAYERS,
} from "../constants.js";

export async function initPhysics() {
  if (typeof SharedArrayBuffer === "undefined") {
    throw new Error(
      "SharedArrayBuffer недоступен — страница не изолирована (COOP/COEP)."
    );
  }

  const joltUrl = new URL(
    "jolt-physics.multithread.wasm-compat.js",
    document.baseURI
  ).href;
  const initJolt = (await import(/* @vite-ignore */ joltUrl)).default;
  const J = await initJolt();
  state.J = J;

  const bpStatic = new J.BroadPhaseLayer(0);
  const bpMoving = new J.BroadPhaseLayer(1);
  const bpInterface = new J.BroadPhaseLayerInterfaceTable(NUM_LAYERS, NUM_LAYERS);
  bpInterface.MapObjectToBroadPhaseLayer(LAYER_NON_MOVING, bpStatic);
  bpInterface.MapObjectToBroadPhaseLayer(LAYER_MOVING, bpMoving);
  bpInterface.MapObjectToBroadPhaseLayer(LAYER_PORTAL, bpMoving);
  bpInterface.MapObjectToBroadPhaseLayer(LAYER_STUCK, bpMoving);
  J.destroy(bpStatic);
  J.destroy(bpMoving);

  const pairFilter = new J.ObjectLayerPairFilterTable(NUM_LAYERS);
  pairFilter.EnableCollision(LAYER_NON_MOVING, LAYER_MOVING);
  pairFilter.EnableCollision(LAYER_MOVING, LAYER_MOVING);

  const objectVsBroadPhase = new J.ObjectVsBroadPhaseLayerFilterTable(
    bpInterface,
    NUM_LAYERS,
    pairFilter,
    NUM_LAYERS
  );

  const settings = new J.JoltSettings();
  settings.mMaxBodies = 2048;
  settings.mMaxBodyPairs = 8192;
  settings.mMaxContactConstraints = 8192;
  state.workerThreads = Math.max(
    1,
    Math.min((navigator.hardwareConcurrency || 4) - 1, 8)
  );
  settings.mMaxWorkerThreads = state.workerThreads;
  settings.mBroadPhaseLayerInterface = bpInterface;
  settings.mObjectVsBroadPhaseLayerFilter = objectVsBroadPhase;
  settings.mObjectLayerPairFilter = pairFilter;

  state.jolt = new J.JoltInterface(settings);
  J.destroy(settings);

  state.world = state.jolt.GetPhysicsSystem();
  state.bodyInterface = state.world.GetBodyInterface();
  state.query = state.world.GetNarrowPhaseQuery();

  state.ray = new J.RRayCast();
  state.raySettings = new J.RayCastSettings();
  state.raySettings.mTreatConvexAsSolid = true;
  state.rayCollector = new J.CastRayClosestHitCollisionCollector();
  state.bpFilterMoving = new J.DefaultBroadPhaseLayerFilter(
    state.jolt.GetObjectVsBroadPhaseLayerFilter(),
    LAYER_MOVING
  );
  state.olFilterMoving = new J.DefaultObjectLayerFilter(
    state.jolt.GetObjectLayerPairFilter(),
    LAYER_MOVING
  );
  state.shapeFilter = new J.ShapeFilter();
  state.tmpRVec3 = new J.RVec3(0, 0, 0);
  state.tmpQuat = new J.Quat(0, 0, 0, 1);
  state.tmpVec3 = new J.Vec3(0, 0, 0);
  state.tmpVec3b = new J.Vec3(0, 0, 0);
  state.zeroVec3 = new J.Vec3(0, 0, 0);
}
