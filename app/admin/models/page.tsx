import StudioHeader from "@/components/StudioHeader";
import ModelAdmin from './ModelAdmin';
import './admin.css';
export default function Page(){ return <><StudioHeader active="references" title="Model library" /><ModelAdmin/></>; }
