import * as smartweave from "smartweave";
import shell from "shelljs"
import { VERSION } from "../helper.js"

// prettier-ignore
const argitRemoteURIRegex = '^gitopia:\/\/([a-zA-Z0-9-_]{43})\/([A-Za-z0-9_.-]*)'
const contractId = "UvjBvJUy8pOMR_lf85tBDaJD0jF85G5Ayj1p2h7yols";

export function parseArgitRemoteURI(remoteURI) {
  const matchGroups = remoteURI.match(argitRemoteURIRegex);
  const repoOwnerAddress = matchGroups[1];
  const repoName = matchGroups[2];

  return { repoOwnerAddress, repoName };
}

export async function makeUpdateRefDataItem(
  arData,
  wallet,
  remoteURI,
  ref,
  oid
) {
  const { repoName } = parseArgitRemoteURI(remoteURI);
  const tags = [
    { name: "Repo", value: repoName },
    { name: "Version", value: "0.0.2" },
    { name: "Ref", value: ref },
    { name: "Type", value: "update-ref" },
    { name: "App-Name", value: "gitopia" },
    {
      name: "Unix-Time",
      value: Math.round(new Date().getTime() / 1000).toString(),
    },
    { name: "Content-Type", value: "text/plain" },
  ];

  const numCommits = shell.exec(`git rev-list --count ${ref}`, { silent: true }).stdout.trim();
  const obj = {
    oid,
    numCommits
  }
  const data = JSON.stringify(obj);

  const item = await arData.createData({ data, tags }, wallet);
  return await arData.sign(item, wallet);
}

export const makeDataItem = async (
  arData,
  wallet,
  remoteURI,
  oid,
  objectBuf
) => {
  const { repoName } = parseArgitRemoteURI(remoteURI);
  const tags = [
    { name: "Oid", value: oid },
    { name: "Version", value: "0.0.2" },
    { name: "Repo", value: repoName },
    { name: "Type", value: "git-object" },
    { name: "App-Name", value: "gitopia" },
    {
      name: "Unix-Time",
      value: Math.round(new Date().getTime() / 1000).toString(),
    },
    { name: "Content-Type", value: "application/octet-stream" },
  ];

  const item = await arData.createData({ data: objectBuf, tags }, wallet);
  return await arData.sign(item, wallet);
};

export const postBundledTransaction = async (
  arweave,
  arData,
  wallet,
  remoteURI,
  dataItems
) => {
  const { repoName } = parseArgitRemoteURI(remoteURI);
  const bundle = await arData.bundleData(dataItems);
  const data = JSON.stringify(bundle);
  const tx = await arweave.createTransaction({ data }, wallet);
  tx.addTag("Repo", repoName);
  tx.addTag("Version", "0.0.2")
  tx.addTag("Type", "git-objects-bundle");
  tx.addTag("App-Name", "gitopia");
  tx.addTag("Bundle-Format", "json");
  tx.addTag("Bundle-Version", "1.0.0");
  tx.addTag("Content-Type", "application/json");
  tx.addTag("Helper", VERSION);

  // Push triggered from gitopia mirror action
  if (process.env.GITHUB_SHA) {
    tx.addTag("Origin", "gitopia-mirror-action")
  } else {
    tx.addTag("Origin", "git-remote-gitopia")
  }

  await arweave.transactions.sign(tx, wallet);
  const uploader = await arweave.transactions.getUploader(tx);

  while (!uploader.isComplete) {
    await uploader.uploadChunk();
    console.error(
      `${uploader.pctComplete}% complete, ${uploader.uploadedChunks}/${uploader.totalChunks}`
    );
  }

  // Send fee to PST holders
  const contractState = await smartweave.default.readContract(arweave, contractId);
  const holder = smartweave.default.selectWeightedPstHolder(contractState.balances);
  // send a fee. You should inform the user about this fee and amount.
  const pstTx = await arweave.createTransaction(
    { target: holder, quantity: arweave.ar.arToWinston("0.01") },
    wallet
  );
  pstTx.addTag("Bundle-TxID", tx.id)
  pstTx.addTag("Repo", repoName);
  pstTx.addTag("Version", "0.0.2");
  pstTx.addTag("App-Name", "gitopia");

  await arweave.transactions.sign(pstTx, wallet);
  await arweave.transactions.post(pstTx);
};
