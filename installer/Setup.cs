using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Management;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("幻景主题管理器安装程序")]
[assembly: AssemblyProduct("幻景 · ChatGPT 主题管理器")]
[assembly: AssemblyFileVersion("1.1.0.0")]
[assembly: System.Runtime.Versioning.TargetFramework(".NETFramework,Version=v4.8")]

static class ThemeSetup {
 const string Product="EmiliaTheme.Codex.Windows";
 const string Version="1.1.0";
 static readonly UTF8Encoding Utf8=new UTF8Encoding(false);
 static readonly JavaScriptSerializer Json=new JavaScriptSerializer{MaxJsonLength=10*1024*1024};
 [DllImport("kernel32.dll")]static extern IntPtr GetStdHandle(int id);
 [DllImport("kernel32.dll")]static extern bool WriteFile(IntPtr file,byte[] bytes,uint count,out uint written,IntPtr overlap);
 static void Print(object value){byte[] b=Utf8.GetBytes(Json.Serialize(value)+Environment.NewLine);uint n;WriteFile(GetStdHandle(-11),b,(uint)b.Length,out n,IntPtr.Zero);}
 static Stream Payload(){return Assembly.GetExecutingAssembly().GetManifestResourceStream("payload.zip");}
 static string DiskPath(string value){
  string full=Path.GetFullPath(value);
  if(full.StartsWith(@"\\?\",StringComparison.Ordinal))return full;
  return full.StartsWith(@"\\",StringComparison.Ordinal)?@"\\?\UNC\"+full.Substring(2):@"\\?\"+full;
 }
 static string ValidRoot(string raw){
  string root=Path.GetFullPath(Environment.ExpandEnvironmentVariables(raw)).TrimEnd(Path.DirectorySeparatorChar);
  if(root.Length<5||String.Equals(root,Path.GetPathRoot(root).TrimEnd('\\'),StringComparison.OrdinalIgnoreCase))throw new Exception("请选择一个独立文件夹，例如 D:\\Huanjing。");
  foreach(string forbidden in new[]{Environment.GetFolderPath(Environment.SpecialFolder.Windows),Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),Environment.GetFolderPath(Environment.SpecialFolder.UserProfile)}){
   if(!String.IsNullOrEmpty(forbidden)&&String.Equals(root,forbidden.TrimEnd('\\'),StringComparison.OrdinalIgnoreCase))throw new Exception("请使用独立的主题文件夹，不要选择系统或用户根目录。");
  }
  return root;
 }
 static string DefaultRoot(){
  using(RegistryKey key=Registry.CurrentUser.OpenSubKey(@"Software\EmiliaTheme")){if(key!=null){string value=Convert.ToString(key.GetValue("InstallLocation"));if(!String.IsNullOrWhiteSpace(value)&&Directory.Exists(value))return value;}}
  try{
   string link=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Startup),"幻景主题管理器.lnk");if(!File.Exists(link))link=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Startup),"Emilia Theme.lnk");
   if(File.Exists(link)){
    dynamic shell=Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell"));dynamic shortcut=shell.CreateShortcut(link);
    string args=Convert.ToString(shortcut.Arguments).Trim().Trim('"');string candidate=Path.GetDirectoryName(args);
    Marshal.FinalReleaseComObject(shortcut);Marshal.FinalReleaseComObject(shell);
    if(Path.GetFileName(args).Equals("Autostart.vbs",StringComparison.OrdinalIgnoreCase)&&File.Exists(Path.Combine(candidate,"LaunchChatGPT.exe")))return candidate;
   }
  }catch{}
  return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Huanjing");
 }
 static void StopHelpers(string root){
  string launcher=Path.Combine(root,"LaunchChatGPT.exe"),node=Path.Combine(root,"runtime","node.exe"),runtime=Path.Combine(root,"runtime.mjs");
  foreach(string name in new[]{"LaunchChatGPT","node"})foreach(Process p in Process.GetProcessesByName(name)){
   using(p)try{
    string image=p.MainModule.FileName;
    if(String.Equals(image,launcher,StringComparison.OrdinalIgnoreCase)){p.Kill();p.WaitForExit(4000);}
    else if(String.Equals(image,node,StringComparison.OrdinalIgnoreCase)){
     using(ManagementObject item=new ManagementObject("Win32_Process.Handle='"+p.Id+"'")){
      string command=Convert.ToString(item["CommandLine"]);
      if(command.IndexOf(runtime,StringComparison.OrdinalIgnoreCase)>=0&&command.Contains("daemon")){p.Kill();p.WaitForExit(4000);}
     }
    }
   }catch{}
  }
 }
 static string RunScript(string root,string file,string arguments){
  string ps=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),@"WindowsPowerShell\v1.0\powershell.exe");
  ProcessStartInfo info=new ProcessStartInfo(ps,"-NoProfile -NonInteractive -ExecutionPolicy Bypass -File \""+Path.Combine(root,file)+"\" "+arguments){UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=root,RedirectStandardOutput=true,RedirectStandardError=true,StandardOutputEncoding=Utf8,StandardErrorEncoding=Utf8};
  using(Process p=Process.Start(info)){
   var output=p.StandardOutput.ReadToEndAsync();var error=p.StandardError.ReadToEndAsync();
   if(!p.WaitForExit(60000)){p.Kill();throw new Exception("安装配置超时，请重新运行安装程序。");}
   if(p.ExitCode!=0)throw new Exception("配置未完成："+error.Result);
   return output.Result;
  }
 }
 static void Extract(string root,Action<int,string> progress){
  Directory.CreateDirectory(root);
  using(Stream resource=Payload())using(ZipArchive zip=new ZipArchive(resource,ZipArchiveMode.Read)){
   ZipArchiveEntry manifestEntry=zip.GetEntry("package-manifest.json");
   Dictionary<string,object> manifest;
   using(StreamReader reader=new StreamReader(manifestEntry.Open(),Utf8))manifest=Json.Deserialize<Dictionary<string,object>>(reader.ReadToEnd());
   System.Collections.IList files=(System.Collections.IList)manifest["files"];int index=0;
   foreach(object raw in files){
    var item=(Dictionary<string,object>)raw;string relative=Convert.ToString(item["path"]),expected=Convert.ToString(item["sha256"]);
    string target=Path.GetFullPath(Path.Combine(root,relative.Replace('/',Path.DirectorySeparatorChar)));
    if(!target.StartsWith(root+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))throw new Exception("安装包文件路径无效。");
    ZipArchiveEntry entry=zip.GetEntry(relative);if(entry==null)throw new Exception("安装包缺少文件："+relative);
    string diskTarget=DiskPath(target);
    bool keep=File.Exists(diskTarget)&&(relative.StartsWith("media/",StringComparison.Ordinal)||relative=="background.png");
    if(!keep){
     Directory.CreateDirectory(DiskPath(Path.GetDirectoryName(target)));string tmp=diskTarget+".install-tmp";
     try{
      using(SHA256 hash=SHA256.Create())using(Stream input=entry.Open())using(FileStream output=new FileStream(tmp,FileMode.Create,FileAccess.Write,FileShare.None)){
       byte[] buffer=new byte[1024*1024];int read;
       while((read=input.Read(buffer,0,buffer.Length))>0){output.Write(buffer,0,read);hash.TransformBlock(buffer,0,read,buffer,0);}
       hash.TransformFinalBlock(new byte[0],0,0);
       string actual=BitConverter.ToString(hash.Hash).Replace("-","").ToLowerInvariant();
       if(actual!=expected)throw new Exception("文件校验失败："+relative);
      }
      if(File.Exists(diskTarget))File.Delete(diskTarget);File.Move(tmp,diskTarget);
     }finally{if(File.Exists(tmp))File.Delete(tmp);}
    }
    index++;if(index%12==0||index==files.Count)progress(index*85/files.Count,"正在安装文件… "+(index*100/files.Count)+"%");
   }
   using(Stream input=manifestEntry.Open())using(FileStream output=File.Create(Path.Combine(root,"package-manifest.json")))input.CopyTo(output);
  }
 }
 static void Install(string root,bool startup,bool desktop,bool launch,bool extractOnly,Action<int,string> progress){
  root=ValidRoot(root);
  bool known=File.Exists(Path.Combine(root,".emilia-theme-install.json"))||(File.Exists(Path.Combine(root,"runtime.mjs"))&&File.Exists(Path.Combine(root,"LaunchChatGPT.exe")));
  if(Directory.Exists(root)&&Directory.GetFileSystemEntries(root).Length>0&&!known)throw new Exception("所选目录已有其他文件。请选择空目录，或原来的主题安装目录。");
  if(!extractOnly){
   progress(0,"正在检查已有主题…");
   if(known){
    string backup=Path.Combine(root,"backups","before-share-upgrade-"+DateTime.Now.ToString("yyyyMMdd-HHmmss"));Directory.CreateDirectory(backup);
    foreach(string name in new[]{"background.json","customization.json","catalog.json","recommended.json","wallpaper-library.json","import-settings.json"}){string file=Path.Combine(root,name);if(File.Exists(file))File.Copy(file,Path.Combine(backup,name),true);}
    StopHelpers(root);
   }
  }
  Extract(root,progress);
  progress(88,"正在识别本机环境…");
  string arguments=extractOnly?"-ExtractOnly":(startup?"":"-NoStartup ")+(desktop?"":"-NoDesktop ")+(launch?"":"-NoLaunch ");
  RunScript(root,"Install-Theme.ps1",arguments);
  progress(100,extractOnly?"文件校验与独立环境配置完成":"安装完成");
 }
 static string[] ReadArgs(string[] args){return args;}
 [STAThread]static void Main(string[] args){
  AppContext.SetSwitch("Switch.System.IO.UseLegacyPathHandling",false);
  AppContext.SetSwitch("Switch.System.IO.BlockLongPaths",false);
  if(args.Length==2&&args[0]=="--extract-only"){
   try{Install(args[1],false,false,false,true,(p,s)=>{});Print(new{pass=true,extractedTo=Path.GetFullPath(args[1])});}
   catch(Exception e){Print(new{pass=false,error=e.Message});Environment.ExitCode=1;}return;
  }
  Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
  if(!Environment.Is64BitOperatingSystem){MessageBox.Show("此安装包适用于 64 位 Windows。","幻景主题管理器");return;}
  Form form=new Form{Text="幻景 · ChatGPT 主题管理器 — 安装",ClientSize=new Size(560,500),StartPosition=FormStartPosition.CenterScreen,FormBorderStyle=FormBorderStyle.FixedDialog,MaximizeBox=false,BackColor=Color.FromArgb(248,246,251),Font=new Font("Microsoft YaHei UI",10)};
  Label title=new Label{Text="幻景 · ChatGPT 主题管理器",Left=28,Top=24,Width=500,Height=36,Font=new Font("Microsoft YaHei UI",19,FontStyle.Bold),ForeColor=Color.FromArgb(72,54,88)};
  Label intro=new Label{Text="官方 ChatGPT Windows 新版适配 · 非官方主题管理器\n生成插画、推荐配色、透明度调节与 Steam 链接导入",Left=30,Top=72,Width=500,Height=58,ForeColor=Color.FromArgb(91,84,100)};
  Label folderLabel=new Label{Text="安装到",Left=30,Top=145,Width=150,Height=24};
  TextBox folder=new TextBox{Text=DefaultRoot(),Left=30,Top=174,Width=407,Height=28};
  Button browse=new Button{Text="浏览…",Left=445,Top=172,Width=83,Height=31,FlatStyle=FlatStyle.System};
  CheckBox desktopBox=new CheckBox{Text="创建桌面入口",Checked=true,Left=32,Top=225,Width=485,Height=26};
  CheckBox startupBox=new CheckBox{Text="自动随 ChatGPT 启用主题",Checked=true,Left=32,Top=260,Width=485,Height=26};
  CheckBox launchBox=new CheckBox{Text="安装后启用主题（必要时会重新打开 ChatGPT）",Checked=true,Left=32,Top=295,Width=500,Height=26};
  Label notice=new Label{Text="请先安装新版官方 ChatGPT Windows 客户端。内置插画可离线使用；导入新壁纸需要 Wallpaper Engine，首次会联网准备导入工具。",Left=30,Top=337,Width=500,Height=48,Font=new Font("Microsoft YaHei UI",9),ForeColor=Color.FromArgb(99,91,108)};
  ProgressBar progress=new ProgressBar{Left=30,Top=395,Width=498,Height=7,Visible=false};
  Label status=new Label{Left=30,Top=409,Width=500,Height=24,Font=new Font("Microsoft YaHei UI",9),ForeColor=Color.FromArgb(99,91,108)};
  Button start=new Button{Text="安装并启用",Left=378,Top=448,Width=150,Height=36,BackColor=Color.FromArgb(121,90,143),ForeColor=Color.White,FlatStyle=FlatStyle.Flat};
  Button readme=new Button{Text="适用范围",Left=30,Top=448,Width=100,Height=36,FlatStyle=FlatStyle.System};
  form.Controls.AddRange(new Control[]{title,intro,folderLabel,folder,browse,desktopBox,startupBox,launchBox,notice,progress,status,start,readme});
  bool busy=false,done=false;
  browse.Click+=(s,e)=>{using(FolderBrowserDialog d=new FolderBrowserDialog{Description="选择独立的主题文件夹",SelectedPath=folder.Text})if(d.ShowDialog()==DialogResult.OK)folder.Text=d.SelectedPath;};
  readme.Click+=(s,e)=>MessageBox.Show("本包接入新版官方 ChatGPT Windows 客户端。其内部包名仍为 OpenAI.Codex，主程序为 ChatGPT.exe。\n\n已在 26.1016.8622.0 版验证。旧版独立客户端、网页、macOS、Linux 和手机端未适配。\n\n主题安装在所选目录，不改写官方客户端安装文件。","适用范围");
  form.FormClosing+=(s,e)=>{if(busy)e.Cancel=true;};
  start.Click+=(s,e)=>{
   if(done){form.Close();return;}
   string target;try{target=ValidRoot(folder.Text);}catch(Exception error){MessageBox.Show(error.Message,"安装目录");return;}
   busy=true;progress.Visible=true;folder.Enabled=browse.Enabled=start.Enabled=desktopBox.Enabled=startupBox.Enabled=launchBox.Enabled=false;
   bool auto=startupBox.Checked,desk=desktopBox.Checked,run=launchBox.Checked;
   BackgroundWorker worker=new BackgroundWorker();
   worker.DoWork+=(sender,eventArgs)=>Install(target,auto,desk,run,false,(p,message)=>form.BeginInvoke((Action)(()=>{progress.Value=p;status.Text=message;})));
   worker.RunWorkerCompleted+=(sender,eventArgs)=>{
    busy=false;start.Enabled=true;
    if(eventArgs.Error!=null){status.Text="安装未完成";MessageBox.Show(eventArgs.Error.Message,"安装未完成");folder.Enabled=browse.Enabled=desktopBox.Enabled=startupBox.Enabled=launchBox.Enabled=true;}
    else{done=true;start.Text="完成";status.Text="安装完成；可从桌面或开始菜单打开主题。";}
   };
   worker.RunWorkerAsync();
  };
  if(args.Length==2&&args[0]=="--preview"){
   form.Opacity=0;form.ShowInTaskbar=false;form.StartPosition=FormStartPosition.Manual;form.Location=new Point(-32000,-32000);form.Show();form.PerformLayout();Application.DoEvents();using(Bitmap bmp=new Bitmap(form.Width,form.Height)){form.DrawToBitmap(bmp,new Rectangle(0,0,bmp.Width,bmp.Height));bmp.Save(args[1],System.Drawing.Imaging.ImageFormat.Png);}form.Dispose();return;
  }
  Application.Run(form);
 }
}
