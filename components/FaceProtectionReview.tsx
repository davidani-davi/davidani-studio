'use client';
import styles from './FaceProtectionReview.module.css';

type Props = {
 imageUrl: string; label: string; boundary: number; blend: number;
 onChange: (boundary: number, blend: number) => void;
};
/** Both edges are percentages of the original image, matching the saved mask. */
export default function FaceProtectionReview({imageUrl,label,boundary,blend,onChange}:Props){
 return <div className={styles.review}>
  <div className={styles.photo}>
   <img src={imageUrl} alt={`${label} protection preview`}/>
   <div aria-label="Hair blend area" className={styles.band} style={{top:`${boundary-blend}%`,height:`${blend}%`}}/>
  </div>
  <p className={styles.guide}>Keep the entire face above the green line and all clothing below the amber line. Only the band between them blends into the new photo.</p>
  <label>Garment boundary · {Number(boundary.toFixed(2))}%
   <input aria-label={`${label} garment boundary`} type="range" min="1" max="80" step="0.1" value={boundary} onChange={e=>{const next=Number(e.target.value);onChange(next,Math.min(blend,next-.1));}}/>
  </label>
  <label>Hair blend · {Number(blend.toFixed(2))}%
   <input aria-label={`${label} hair blend`} type="range" min="0.1" max={Math.min(5,boundary-.1)} step="0.1" value={blend} onChange={e=>onChange(boundary,Number(e.target.value))}/>
  </label>
  <p className={styles.guide}>Widen the band to soften a hair join. Keep its green edge below the face. These settings are saved with this view and reused for future garment swaps.</p>
  <a href={imageUrl} target="_blank" rel="noreferrer">Open full-size reference ↗</a>
 </div>;
}
