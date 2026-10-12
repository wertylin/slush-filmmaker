'use client';
import { useEffect, useRef } from 'react';
import { templates } from './shared';
type Tool = { name: string; description: string; inputSchema: object; annotations?: { readOnlyHint: boolean }; execute: (input: Record<string, unknown>) => unknown };
type Context = { registerTool: (tool: Tool, options?: { signal: AbortSignal }) => void | Promise<void> };
export function useWebMCP(actions: { preview: (id:string)=>void; start: (id?:string)=>void; getState?:()=>unknown; selectScene?:(id:string)=>void }) {
 const ref=useRef(actions); ref.current=actions;
 useEffect(()=>{const context=(document as Document & {modelContext?:Context}).modelContext; if(!context?.registerTool)return; const controller=new AbortController();
 const schema={type:'object',properties:{templateId:{type:'string',enum:templates.map(t=>t.id)}},required:['templateId'],additionalProperties:false};
 function valid(input:Record<string,unknown>){const id=String(input.templateId);if(!templates.some(t=>t.id===id))throw new Error('Unknown template');return id;}
 const tools:Tool[]=[{name:'list_templates',description:'List available founder film template concepts.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>templates.map(({id,name,description,time})=>({id,name,description,time}))},{name:'preview_template',description:'Open a visual template preview in the visible interface. Does not generate video.',inputSchema:schema,execute:input=>{const id=valid(input);ref.current.preview(id);return {status:'preview_opened',templateId:id};}},{name:'start_film_creation',description:'Open the studio with a selected template. Creates no video and incurs no generation charges.',inputSchema:schema,execute:input=>{const id=valid(input);ref.current.start(id);return {status:'studio_opened',templateId:id};}}];
 if(ref.current.getState)tools.push({name:'get_studio_state',description:'Read the current local demo project, selected scene, and activity.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>ref.current.getState?.()});
 if(ref.current.selectScene)tools.push({name:'select_scene',description:'Select an existing storyboard scene in the visible editor.',inputSchema:{type:'object',properties:{sceneId:{type:'string'}},required:['sceneId'],additionalProperties:false},execute:input=>{ref.current.selectScene?.(String(input.sceneId));return {selectedSceneId:input.sceneId};}});
 for(const tool of tools)Promise.resolve(context.registerTool(tool,{signal:controller.signal})).catch(console.error);return()=>controller.abort();},[]);
}
