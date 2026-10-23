using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Management;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

[assembly: AssemblyTitle("幻景主题管理器启动助手")]
[assembly: AssemblyProduct("幻景 · ChatGPT 主题管理器")]
[assembly: AssemblyFileVersion("1.1.0.0")]
[assembly: System.Runtime.Versioning.TargetFramework(".NETFramework,Version=v4.8")]

[ComImport,Guid("2e941141-7f97-4756-ba1d-9decde894a3d"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IThemeActivation {
 [PreserveSig] int ActivateApplication([MarshalAs(UnmanagedType.LPWStr)]string id,[MarshalAs(UnmanagedType.LPWStr)]string args,uint options,out uint pid);
 [PreserveSig] int ActivateForFile(IntPtr id,IntPtr items,IntPtr verb,out uint pid);
 [PreserveSig] int ActivateForProtocol(IntPtr id,IntPtr items,out uint pid);
}
static class AutoThemeLauncher {
 static readonly string Root=AppDomain.CurrentDomain.BaseDirectory;
 static readonly string Node=Path.Combine(Root,"runtime","node.exe");
 static readonly string Runtime=Path.Combine(Root,"runtime.mjs");
 const string Family="OpenAI.Codex_2p2nqsd0c76g0";
 static readonly UTF8Encoding Utf8=new UTF8Encoding(false);
 static readonly JavaScriptSerializer Json=new JavaScriptSerializer();
 static Dictionary<string,object> resolved;
 static DateTime lastResolve=DateTime.MinValue;
 static string resolveError="";
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,int pid);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern int GetPackageFamilyName(IntPtr process,ref uint length,StringBuilder name);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool QueryFullProcessImageName(IntPtr process,uint flags,StringBuilder name,ref uint size);
 [DllImport("shell32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CommandLineToArgvW(string command,out int count);
 [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr memory);
 [DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int id);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool WriteFile(IntPtr file,byte[] bytes,uint count,out uint written,IntPtr overlapped);
 [DllImport("iphlpapi.dll",SetLastError=true)] static extern uint GetExtendedTcpTable(IntPtr table,ref int size,bool order,int family,int tableClass,uint reserved);
 static void Log(string text){try{string f=Path.Combine(Root,"startup-bridge.log");if(File.Exists(f)&&new FileInfo(f).Length>1024*1024)File.Move(f,f+"."+DateTime.Now.ToString("yyyyMMddHHmmss"));File.AppendAllText(f,DateTime.Now.ToString("s")+" "+text+Environment.NewLine,Utf8);}catch{}}
 static void Atomic(string name,string text){string f=Path.Combine(Root,name),tmp=f+"."+Process.GetCurrentProcess().Id+".tmp";File.WriteAllText(tmp,text,Utf8);if(File.Exists(f))File.Replace(tmp,f,null);else File.Move(tmp,f);}
 static string Value(string key){return resolved!=null&&resolved.ContainsKey(key)?Convert.ToString(resolved[key]):"";}
 static string Image(int pid){IntPtr h=OpenProcess(0x1000,false,pid);if(h==IntPtr.Zero)return "";try{uint n=32768;StringBuilder s=new StringBuilder((int)n);return QueryFullProcessImageName(h,0,s,ref n)?s.ToString():"";}finally{CloseHandle(h);}}
 static string PackageFamily(int pid){IntPtr h=OpenProcess(0x1000,false,pid);if(h==IntPtr.Zero)return "";try{uint n=0;int result=GetPackageFamilyName(h,ref n,null);if(result!=122||n==0)return "";StringBuilder b=new StringBuilder((int)n);return GetPackageFamilyName(h,ref n,b)==0?b.ToString():"";}finally{CloseHandle(h);}}
 static bool Trusted(int pid){
  if(!String.Equals(PackageFamily(pid),Family,StringComparison.Ordinal))return false;
  string actual=Image(pid),name=Path.GetFileName(actual);
  if(String.Equals(name,"ChatGPT.exe",StringComparison.OrdinalIgnoreCase)||String.Equals(name,"Codex.exe",StringComparison.OrdinalIgnoreCase))return true;
  if(resolved==null)Resolve(false);
  return String.Equals(actual,Value("executable"),StringComparison.OrdinalIgnoreCase);
 }
 static string CommandLine(int id){try{using(ManagementObject item=new ManagementObject("Win32_Process.Handle='"+id+"'")){return Convert.ToString(item["CommandLine"]);}}catch{return "";}}
 static string[] Arguments(string command){int count;IntPtr memory=CommandLineToArgvW(command,out count);if(memory==IntPtr.Zero)return new string[0];try{string[] result=new string[count];for(int i=0;i<count;i++)result[i]=Marshal.PtrToStringUni(Marshal.ReadIntPtr(memory,i*IntPtr.Size));return result;}finally{LocalFree(memory);}}
 static bool Configured(int pid,out bool known){string line=CommandLine(pid);known=!String.IsNullOrWhiteSpace(line);foreach(string arg in Arguments(line))if(arg=="--remote-debugging-port=9387")return true;return false;}
 static bool Worker(int pid){
  try{
  if(!String.Equals(Image(pid),Node,StringComparison.OrdinalIgnoreCase))return false;
  string[] args=Arguments(CommandLine(pid));
  return args.Length==3&&String.Equals(Path.GetFullPath(args[1]),Runtime,StringComparison.OrdinalIgnoreCase)&&args[2]=="daemon";
  }catch{return false;}
 }
 static bool Resolve(bool force){
  if(!force&&(DateTime.UtcNow-lastResolve).TotalSeconds<30)return resolved!=null&&resolveError=="";
  lastResolve=DateTime.UtcNow;
  try{
   string ps=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),@"WindowsPowerShell\v1.0\powershell.exe");
   ProcessStartInfo info=new ProcessStartInfo(ps,"-NoProfile -NonInteractive -ExecutionPolicy Bypass -File \""+Path.Combine(Root,"Resolve-App.ps1")+"\""){UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true,StandardOutputEncoding=Utf8,StandardErrorEncoding=Utf8,WorkingDirectory=Root};
   using(Process p=Process.Start(info)){
    var outputTask=p.StandardOutput.ReadToEndAsync();var errorTask=p.StandardError.ReadToEndAsync();if(!p.WaitForExit(12000)){p.Kill();throw new Exception("应用信息读取超时");}
    string output=outputTask.Result;
    if(p.ExitCode!=0)throw new Exception("应用可能正在更新，等待安装就绪");
    Dictionary<string,object> next=Json.Deserialize<Dictionary<string,object>>(output.Trim().TrimStart('\uFEFF'));
    if(Convert.ToString(next["family"])!=Family||!Convert.ToString(next["aumid"]).StartsWith(Family+"!",StringComparison.Ordinal))throw new Exception("应用身份不匹配");
    string old=Value("version");resolved=next;resolveError="";
    Atomic("app-id.txt",Value("aumid"));Atomic("client-path.txt",Value("executable"));Atomic("resolved-app.json",Json.Serialize(resolved));
    if(old!=Value("version"))Log("resolved installed app version="+Value("version")+" executable="+Path.GetFileName(Value("executable")));
    return true;
   }
  }catch(Exception error){resolveError=error.Message;Log("resolve: "+error.Message);return false;}
 }
 static Process MainProcess(bool visibleOnly){
  HashSet<string> names=new HashSet<string>(StringComparer.OrdinalIgnoreCase){"ChatGPT","Codex"};if(Value("processName")!="")names.Add(Value("processName"));
  List<Process> candidates=new List<Process>();
  foreach(string name in names)foreach(Process p in Process.GetProcessesByName(name))candidates.Add(p);
  Process selected=null;
  try{
   foreach(Process p in candidates)try{if(p.MainWindowHandle!=IntPtr.Zero&&Trusted(p.Id)){selected=p;return p;}}catch{}
   if(!visibleOnly)foreach(Process p in candidates)try{if(Trusted(p.Id)){bool child=false;foreach(string arg in Arguments(CommandLine(p.Id)))if(arg.StartsWith("--type=",StringComparison.Ordinal))child=true;if(!child){selected=p;return p;}}}catch{}
   return null;
  }finally{foreach(Process p in candidates)if(p!=selected)p.Dispose();}
 }
 static int PortOwner(){
  int size=0;GetExtendedTcpTable(IntPtr.Zero,ref size,false,2,3,0);if(size<4||size>16*1024*1024)return 0;IntPtr memory=Marshal.AllocHGlobal(size);
  try{if(GetExtendedTcpTable(memory,ref size,false,2,3,0)!=0)return 0;int count=Marshal.ReadInt32(memory);int owner=0;
   for(int i=0;i<count;i++){IntPtr row=IntPtr.Add(memory,4+i*24);int raw=Marshal.ReadInt32(row,8);int port=(ushort)IPAddress.NetworkToHostOrder((short)raw);if(port!=9387)continue;if(Marshal.ReadInt32(row,4)!=0x0100007f)return -1;owner=Marshal.ReadInt32(row,20);}return owner;
  }finally{Marshal.FreeHGlobal(memory);}
 }
 static bool Connected(){
  try{int owner=PortOwner();if(owner<=0||!Trusted(owner))return false;HttpWebRequest request=(HttpWebRequest)WebRequest.Create("http://127.0.0.1:9387/json/version");request.Proxy=null;request.Timeout=1000;request.ReadWriteTimeout=1000;
   using(WebResponse response=request.GetResponse())using(StreamReader reader=new StreamReader(response.GetResponseStream())){var data=Json.Deserialize<Dictionary<string,object>>(reader.ReadToEnd());Uri uri=new Uri(Convert.ToString(data["webSocketDebuggerUrl"]));return uri.Scheme=="ws"&&uri.Host=="127.0.0.1"&&uri.Port==9387&&uri.AbsolutePath.StartsWith("/devtools/browser/",StringComparison.Ordinal);}
  }catch{return false;}
 }
 static bool WorkerAlive(){try{var data=Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(Root,"daemon.lock")));return Worker(Convert.ToInt32(data["pid"]));}catch{return false;}}
 static void StartWorker(){try{if(File.Exists(Path.Combine(Root,"stop.flag"))||WorkerAlive())return;Process.Start(new ProcessStartInfo(Node,"\""+Runtime+"\" daemon"){UseShellExecute=false,CreateNoWindow=true,WindowStyle=ProcessWindowStyle.Hidden,WorkingDirectory=Root});Log("theme worker started");}catch(Exception error){Log("worker: "+error.Message);}}
 static void Activate(){
  if(!Resolve(false))throw new Exception(resolveError);
  for(int attempt=0;attempt<2;attempt++){
   object manager=Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C")));
   try{uint pid;int result=((IThemeActivation)manager).ActivateApplication(Value("aumid"),"--remote-debugging-address=127.0.0.1 --remote-debugging-port=9387",0,out pid);Marshal.ThrowExceptionForHR(result);Log("activated current package; pid="+pid);return;}
   catch{if(attempt!=0||!Resolve(true))throw;}
   finally{Marshal.FinalReleaseComObject(manager);}
  }
 }
 static bool Open(bool repair,bool activateExisting,bool forceConnection){
  using(Mutex gate=new Mutex(false,"Local\\EmiliaTheme.Launch.v4")){
   bool entered=false;try{try{entered=gate.WaitOne(100);}catch(AbandonedMutexException){entered=true;}if(!entered)return false;
    if(!Resolve(false))return false;
    using(Process app=MainProcess(false)){
     if(app!=null){
      bool known;bool configured=Configured(app.Id,out known);
      if(configured&&(!forceConnection||Connected())){if(activateExisting)Activate();StartWorker();return true;}
      if(!known||!repair)return false;
      if(app.MainWindowHandle==IntPtr.Zero){if(activateExisting)Activate();return false;}
      Log("reconnecting ordinary app pid="+app.Id);
      if(!Trusted(app.Id)||!app.CloseMainWindow()||!app.WaitForExit(6000)){Log("app remains open; retry later without force termination");return false;}
      Thread.Sleep(500);
     }
    }
    // The updater may register a new version while the old window closes.
    if(!Resolve(true))return false;Activate();StartWorker();return true;
   }finally{if(entered)gate.ReleaseMutex();}
  }
 }
 static string lastHealthKey="";
 static DateTime lastHealthWrite=DateTime.MinValue;
 static void Status(string state,int pid){
  try{
   string key=state+"|"+pid+"|"+Value("version")+"|"+resolveError;
   if(key==lastHealthKey&&(DateTime.UtcNow-lastHealthWrite).TotalSeconds<10)return;
   Atomic("startup-health.json",Json.Serialize(new{version="1.1.0",state=state,appPid=pid,packageVersion=Value("version"),resolveError=resolveError,watcherPid=Process.GetCurrentProcess().Id,checkedAt=DateTime.UtcNow.ToString("o")}));
   lastHealthKey=key;lastHealthWrite=DateTime.UtcNow;
  }catch{}
 }
 static void Watch(bool adopt){
  using(Mutex gate=new Mutex(false,"Local\\EmiliaTheme.Watch.v4")){
   bool entered=false;try{try{entered=gate.WaitOne(0);}catch(AbandonedMutexException){entered=true;}if(!entered)return;
    Log("update-resilient watcher started; pid="+Process.GetCurrentProcess().Id);
    DateTime started=DateTime.UtcNow,workerCheck=DateTime.MinValue,healthCheck=DateTime.MinValue,lastRepair=DateTime.MinValue;
    Dictionary<int,int> retries=new Dictionary<int,int>();Queue<DateTime> repairs=new Queue<DateTime>();string previousVersion="";DateTime updateUntil=DateTime.MinValue;int previousPid=0;bool connected=false;
    Resolve(true);previousVersion=Value("version");StartWorker();workerCheck=DateTime.UtcNow;
    while(true){
     try{
      if(File.Exists(Path.Combine(Root,"stop.flag"))){Status("disabled",0);Thread.Sleep(1000);continue;}
      bool packageReady=Resolve(false);if(Value("version")!=previousVersion){previousVersion=Value("version");updateUntil=DateTime.UtcNow.AddMinutes(5);}
      if((DateTime.UtcNow-workerCheck).TotalSeconds>=10){StartWorker();workerCheck=DateTime.UtcNow;}
      using(Process app=MainProcess(true)){
       if(app==null){Status(packageReady?"waiting-for-app":"waiting-for-update",0);previousPid=0;}
       else{
        bool known;bool configured=Configured(app.Id,out known);
        if(app.Id!=previousPid||(DateTime.UtcNow-healthCheck).TotalSeconds>=10){connected=Connected();healthCheck=DateTime.UtcNow;previousPid=app.Id;}
        if(configured){Status(connected?"connected":"waiting-for-connection",app.Id);}
        else if(known&&packageReady){
         bool eligible=adopt||app.StartTime.ToUniversalTime()>=started.AddSeconds(-90)||DateTime.UtcNow<updateUntil;
         int count;retries.TryGetValue(app.Id,out count);while(repairs.Count>0&&(DateTime.UtcNow-repairs.Peek()).TotalMinutes>=10)repairs.Dequeue();
         if(eligible&&count<3&&repairs.Count<2&&(DateTime.UtcNow-lastRepair).TotalSeconds>=45){
          retries[app.Id]=count+1;lastRepair=DateTime.UtcNow;repairs.Enqueue(lastRepair);Status("reconnecting",app.Id);if(Open(true,false,false)){adopt=false;healthCheck=DateTime.MinValue;}
         }else Status(eligible?"waiting-to-retry":"use-repair-shortcut",app.Id);
        }else Status(packageReady?"waiting-for-process-info":"waiting-for-update",app.Id);
       }
      }
     }catch(Exception error){Log("watch: "+error.Message);Status("retrying",0);}
     Thread.Sleep(1000);
    }
   }finally{if(entered)gate.ReleaseMutex();}
  }
 }
 static void StartWatcher(){Process.Start(new ProcessStartInfo(Path.Combine(Root,"LaunchChatGPT.exe"),"--watch"){UseShellExecute=false,CreateNoWindow=true,WindowStyle=ProcessWindowStyle.Hidden,WorkingDirectory=Root});}
 static void Print(object value){byte[] bytes=Utf8.GetBytes(Json.Serialize(value)+Environment.NewLine);uint written;WriteFile(GetStdHandle(-11),bytes,(uint)bytes.Length,out written,IntPtr.Zero);}
 [STAThread] static void Main(string[] args){
  AppContext.SetSwitch("Switch.System.IO.UseLegacyPathHandling",false);
  AppContext.SetSwitch("Switch.System.IO.BlockLongPaths",false);
  bool watch=Array.IndexOf(args,"--watch")>=0;
  try{
   if(args.Length==2&&args[0]=="--owner-check"){int pid;if(!Int32.TryParse(args[1],out pid)||pid<=0){Print(new{trusted=false});return;}Print(new{trusted=Trusted(pid),pid=pid,family=PackageFamily(pid)});return;}
   if(args.Length==2&&args[0]=="--worker-check"){int pid;bool valid=Int32.TryParse(args[1],out pid)&&pid>0&&Worker(pid);bool known=pid<=0||!String.Equals(Image(pid),Node,StringComparison.OrdinalIgnoreCase)||!String.IsNullOrWhiteSpace(CommandLine(pid));Print(new{valid=valid,known=known});return;}
   if(Array.IndexOf(args,"--diagnose-json")>=0||Array.IndexOf(args,"--diagnose")>=0){bool found=Resolve(true);using(Process app=MainProcess(false)){bool known=false;bool configured=app!=null&&Configured(app.Id,out known);var data=new{resolved=found,package=resolved,appPid=app==null?0:app.Id,configured=configured,commandKnown=known,connected=Connected(),workerAlive=WorkerAlive(),resolveError=resolveError};Atomic("startup-diagnostics.json",Json.Serialize(data));Print(data);}return;}
   if(watch){Watch(Array.IndexOf(args,"--adopt-current")>=0);return;}
   string stop=Path.Combine(Root,"stop.flag");if(File.Exists(stop))File.Delete(stop);
   StartWatcher();bool repair=Array.IndexOf(args,"--repair")>=0;bool ready=Open(true,!repair,repair);
   if(!ready&&repair)MessageBox.Show("应用可能正在更新，或暂时无法重新连接。后台会继续检测，请等更新完成后再试一次。","幻景 · 连接修复");
  }catch(Exception error){Log("launch: "+error.ToString());if(args.Length>0&&(args[0].EndsWith("check")||args[0].StartsWith("--diagnose",StringComparison.Ordinal))){Print(new{trusted=false,valid=false,error=error.Message});Environment.ExitCode=1;return;}if(!watch)MessageBox.Show("主题暂时未连接："+error.Message,"幻景主题管理器");}
 }
}
