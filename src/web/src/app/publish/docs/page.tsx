import { requirePublisher } from "@/lib/session";
import { PublishMenu } from "../PublishMenu";

const MAC_ZIP = "cd mygame\nzip -r -X ../mygame.zip . -x '*.DS_Store' '*__MACOSX*' '._*' '*/._*'";
const LINUX_ZIP = "cd mygame\nzip -r ../mygame.zip .";
const WSL_ZIP = "cd /mnt/c/Users/me/mygame\nzip -r ../mygame.zip .";

export default async function PublishDocs() {
  await requirePublisher();
  return (
    <>
      <PublishMenu active="docs" />
      <h1 className="h3 mb-3">How to make the zip for a release</h1>
      <p>
        A release is one zip file. SPUN on the Next unzips it into the install directory of the app. The CMS checks
        the zip when you upload it, and refuses it if it breaks a rule. The{" "}
        <a href="/api.md">API description</a> lists all the rules.
      </p>
      <h2 className="h5 mt-4">Rules</h2>
      <ul data-testid="docs-rules">
        <li>
          Put the files at the root of the zip, not inside a parent directory. If all files are in one directory, such
          as <code>mygame/</code>, the zip is refused. Subdirectories next to other files are fine.
        </li>
        <li>
          No macOS files: no <code>__MACOSX/</code> directory, no <code>.DS_Store</code> file and no file whose name
          starts with <code>._</code>, at any depth.
        </li>
        <li>
          A dot command is a file at the root of the zip whose name ends <code>.dot</code>, in any case. After the Next
          installs or updates the app, <code>.spun</code> moves it to <code>C:/dot/</code> without the extension:{" "}
          <code>wifi.dot</code> goes to <code>C:/dot/wifi</code>. The names of the dot commands the Next already has,
          and <code>spun</code>, are reserved: a zip with such a dot command is refused, unless an admin has given
          the app an override for that name.
        </li>
      </ul>
      <h2 className="h5 mt-4">Make the zip</h2>
      <p>
        In these commands, <code>mygame</code> is the directory with the files of your release. Each command makes{" "}
        <code>mygame.zip</code> next to that directory, with the files at its root.
      </p>
      <h3 className="h6">macOS</h3>
      <p>This command leaves out the macOS files.</p>
      <pre className="bg-body-tertiary p-3 rounded" data-testid="docs-zip-macos">
        <code>{MAC_ZIP}</code>
      </pre>
      <h3 className="h6">Linux</h3>
      <pre className="bg-body-tertiary p-3 rounded" data-testid="docs-zip-linux">
        <code>{LINUX_ZIP}</code>
      </pre>
      <p>If the files came from a Mac, use the macOS command. It works on Linux too.</p>
      <h3 className="h6">Windows, with WSL</h3>
      <p>
        Run the Linux command in WSL. Your Windows drives are under <code>/mnt</code>: <code>C:\Users\me\mygame</code>{" "}
        is <code>/mnt/c/Users/me/mygame</code>.
      </p>
      <pre className="bg-body-tertiary p-3 rounded" data-testid="docs-zip-wsl">
        <code>{WSL_ZIP}</code>
      </pre>
    </>
  );
}
