import * as THREE from "three";
import { engine } from "../engine.js";
import {
  LAKE_WATER_SIZE,
  LAKE_WATER_SEGMENTS,
  LAKE_WATER_LEVEL,
  LAKE_SIZE,
  LAKE_WAVE_DIRS,
  LAKE_WAVE_AMPS,
  LAKE_WAVE_KS,
} from "../constants.js";
import { makeLakeHeightTexture } from "./lakeTextures.js";

let waterMat = null;

export function initLakeWater() {
  const SUN = new THREE.Vector3(0.6, 0.5, 0.35).normalize();

  const W = LAKE_WAVE_DIRS.map(
    (dir, i) => new THREE.Vector4(Math.cos(dir), Math.sin(dir), LAKE_WAVE_AMPS[i], LAKE_WAVE_KS[i])
  );
  const R = [0, 1, 2, 3, 4, 5].map(() => new THREE.Vector4(0, 0, -999, 0));

  const htex = makeLakeHeightTexture();

  const common = "uniform float uTime; uniform vec4 uW[4]; uniform vec4 uR[6];\nfloat wh(vec2 p){ float h=0.; for(int i=0;i<4;i++){ vec4 w=uW[i]; h+=w.z*sin(dot(w.xy,p)*w.w-sqrt(9.8*w.w)*uTime); } for(int i=0;i<6;i++){ vec4 r=uR[i]; float a=uTime-r.z; if(a>0. && a<7.){ float d=length(p-r.xy); float f=d-a*3.; h+=r.w*sin(f*4.)*exp(-f*f*.6)*exp(-a*.7)/(1.+d*.3); } } return h; }";

  const skyGLSL = "vec3 sky(vec3 d){float t=clamp(d.y,0.,1.);vec3 c=mix(vec3(.75,.85,.95),vec3(.18,.42,.82),pow(t,.5));float s=max(dot(d,uSun),0.);c+=vec3(1.,.85,.6)*(pow(s,600.)*3.+pow(s,8.)*.25);return c;}";

  waterMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uW: { value: W },
      uR: { value: R },
      uSun: { value: SUN },
      uLevel: { value: LAKE_WATER_LEVEL },
      uH: { value: htex },
    },
    vertexShader: common + "uniform float uLevel; varying vec3 vW;\nvoid main(){ vec3 p=position; p.y=uLevel+wh(p.xz); vW=p; gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.); }",
    fragmentShader: common + "uniform vec3 uSun; uniform float uLevel; uniform sampler2D uH; varying vec3 vW; " + skyGLSL + "\nfloat wd(vec2 p){ return 0.012*sin(p.x*3.1+uTime*1.3+sin(p.y*2.3))+0.009*sin(p.y*4.3-uTime*1.7+p.x*1.1); }\nfloat f(vec2 p){ return wh(p)+wd(p); }\nvoid main(){\n  vec2 xz=vW.xz; float e=0.08;\n  float hx=f(xz+vec2(e,0.))-f(xz-vec2(e,0.)); float hz=f(xz+vec2(0.,e))-f(xz-vec2(0.,e));\n  vec3 n=normalize(vec3(-hx,2.*e,-hz));\n  vec3 V=normalize(cameraPosition-vW);\n  float fres=0.02+0.98*pow(1.-max(dot(n,V),0.),5.);\n  vec3 refl=sky(reflect(-V,n));\n  float tb=texture2D(uH,xz/" + LAKE_SIZE + ".0+.5).r*30.-6.;\n  float depth=max(uLevel-tb,0.);\n  vec3 body=mix(vec3(.15,.55,.5),vec3(.01,.1,.2),1.-exp(-depth*.45));\n  body+=vec3(.04,.18,.14)*smoothstep(.1,.35,vW.y-uLevel);\n  vec3 c=mix(body,refl,fres);\n  c+=pow(max(dot(reflect(-uSun,n),V),0.),180.)*1.5*vec3(1.,.9,.7);\n  float fn=sin(xz.x*2.+uTime*.5)*sin(xz.y*2.3-uTime*.4)*.5+.5;\n  float foam=1.-smoothstep(0.,.25+.15*fn,depth);\n  c=mix(c,vec3(1.),foam*.8);\n  float a=max(clamp(smoothstep(0.,.8,depth)*.9+.1,0.,1.),foam*.9);\n  float dist=length(cameraPosition-vW);\n  c=mix(c,vec3(.75,.85,.95),1.-exp(-dist*dist*.011*.011));\n  gl_FragColor=vec4(c,a);\n}",
  });

  const geo = new THREE.PlaneGeometry(LAKE_WATER_SIZE, LAKE_WATER_SIZE, LAKE_WATER_SEGMENTS, LAKE_WATER_SEGMENTS);
  geo.rotateX(-Math.PI / 2);

  const mesh = new THREE.Mesh(geo, waterMat);
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  engine.scene.add(mesh);
}

export function updateLakeWater(dt) {
  if (waterMat) waterMat.uniforms.uTime.value += dt;
}
