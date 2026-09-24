function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"public, max-age=30, stale-while-revalidate=120","X-Content-Type-Options":"nosniff"}})}
export async function onRequestGet(context){
 const db=context.env.TRACKER_DB;
 if(!db)return json({error:"Public diagram is unavailable."},503);
 await db.prepare("CREATE TABLE IF NOT EXISTS tracker_state (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL)").run();
 const row=await db.prepare("SELECT payload,updated_at FROM tracker_state WHERE id=1").first();
 if(!row)return json({products:[],tasks:[],diagramTaskOrder:[],updatedAt:null});
 let data;try{data=JSON.parse(row.payload)}catch{return json({error:"Tracker data is invalid."},500)}
 return json({
  products:(Array.isArray(data.products)?data.products:[]).map(String),
  tasks:(Array.isArray(data.tasks)?data.tasks:[]).map(task=>({
   id:String(task.id||""),name:String(task.name||""),status:String(task.status||""),product:String(task.product||""),
   owner:String(task.owner||""),nextUpdateDeadline:String(task.nextUpdateDeadline||""),deadline:String(task.deadline||""),
   comment:String(task.comment||""),subtasks:(Array.isArray(task.subtasks)?task.subtasks:[]).map(sub=>({
    title:String(sub.title||""),status:String(sub.status||""),deadline:String(sub.deadline||"")
   }))
  })),
  diagramTaskOrder:Array.isArray(data.diagramTaskOrder)?data.diagramTaskOrder.map(String):[],
  updatedAt:row.updated_at
 });
}