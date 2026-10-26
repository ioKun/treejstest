import { state } from "../state.js";
import { LAYER_NON_MOVING, LAKE_SIZE, LAKE_TERRAIN_PHYSICS_SEGMENTS } from "../constants.js";
import { lakeHeight } from "../scenes/lake/terrainMath.js";

export function buildLakeTerrainPhysics() {
  const J = state.J;
  const segments = LAKE_TERRAIN_PHYSICS_SEGMENTS;
  const size = LAKE_SIZE;

  const vertices = new J.VertexList();
  const triangles = new J.IndexedTriangleList();
  const materials = new J.PhysicsMaterialList();
  materials.push_back(new J.PhysicsMaterial());

  const step = size / segments;
  const half = size / 2;
  const vertsPerRow = segments + 1;

  for (let iz = 0; iz <= segments; iz++) {
    for (let ix = 0; ix <= segments; ix++) {
      const x = -half + ix * step;
      const z = -half + iz * step;
      const y = lakeHeight(x, z);
      vertices.push_back(new J.Float3(x, y, z));
    }
  }

  for (let iz = 0; iz < segments; iz++) {
    for (let ix = 0; ix < segments; ix++) {
      const i0 = iz * vertsPerRow + ix;
      const i1 = i0 + 1;
      const i2 = i0 + vertsPerRow;
      const i3 = i2 + 1;
      triangles.push_back(new J.IndexedTriangle(i0, i2, i1, 0));
      triangles.push_back(new J.IndexedTriangle(i1, i2, i3, 0));
    }
  }

  const settings = new J.MeshShapeSettings(vertices, triangles, materials);
  const result = settings.Create();
  if (result.HasError()) {
    const err = result.GetError();
    J.destroy(result);
    J.destroy(settings);
    J.destroy(triangles);
    J.destroy(vertices);
    J.destroy(materials);
    throw new Error("Lake terrain shape creation failed: " + err);
  }
  const shape = result.Get();

  const position = new J.RVec3(0, 0, 0);
  const rotation = new J.Quat(0, 0, 0, 1);
  const bodySettings = new J.BodyCreationSettings(
    shape,
    position,
    rotation,
    J.EMotionType_Static,
    LAYER_NON_MOVING
  );
  bodySettings.mFriction = 0.9;
  bodySettings.mRestitution = 0;

  const body = state.bodyInterface.CreateBody(bodySettings);
  J.destroy(bodySettings);
  J.destroy(position);
  J.destroy(rotation);

  state.bodyInterface.AddBody(body.GetID(), J.EActivation_Activate);

  J.destroy(result);
  J.destroy(settings);
  J.destroy(triangles);
  J.destroy(vertices);
  J.destroy(materials);

  return body;
}
