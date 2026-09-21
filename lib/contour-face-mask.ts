import type {ReferencePixels} from './garment-only';
export type ReviewedFaceContour = {
  width:number; height:number; sha256:string;
  // Pixel coordinates around the entire approved face, inside hair/neck.
  points:[number,number][];
  featherPixels:number;
};
/** Review candidate only. Zero protects the entire contour; feather is OUTSIDE.
 * No horizontal cut, no exposure matching and no changes outside the support.
 * The contour + feather must be reviewed against clothing for each source image.
 */
export function contourFaceMask(ref:ReferencePixels, reviewed:ReviewedFaceContour):Buffer {
  const {width:w,height:h}=ref,{points,featherPixels:f}=reviewed;
  if(w!==reviewed.width||h!==reviewed.height||ref.sha256!==reviewed.sha256)throw Error('Contour reference changed. Review it again.');
  if(!Number.isFinite(f)||f<1||f>Math.min(w,h)/4||points.length<3||points.some(p=>p.length!==2||p.some(Number.isNaN)||!p.every(Number.isFinite)||p[0]<0||p[0]>=w||p[1]<0||p[1]>=h))throw Error('Invalid reviewed contour.');
  const mask=Buffer.alloc(w*h,255);
  const x0=Math.max(0,Math.floor(Math.min(...points.map(p=>p[0]))-f)),x1=Math.min(w-1,Math.ceil(Math.max(...points.map(p=>p[0]))+f));
  const y0=Math.max(0,Math.floor(Math.min(...points.map(p=>p[1]))-f)),y1=Math.min(h-1,Math.ceil(Math.max(...points.map(p=>p[1]))+f));
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++) {
    let inside=false,d2=Infinity;
    for(let i=0,j=points.length-1;i<points.length;j=i++) {
      const [ax,ay]=points[j],[bx,by]=points[i];
      if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)inside=!inside;
      const dx=bx-ax,dy=by-ay,length=dx*dx+dy*dy;
      const t=length?Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/length)):0;
      d2=Math.min(d2,(x-ax-t*dx)**2+(y-ay-t*dy)**2);
    }
    const t=inside?0:Math.min(1,Math.sqrt(d2)/f);
    mask[y*w+x]=Math.round(255*t*t*(3-2*t));
  }
  return mask;
}
