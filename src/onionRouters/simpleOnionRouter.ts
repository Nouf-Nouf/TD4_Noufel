import bodyParser from "body-parser";
import express from "express";
import { BASE_ONION_ROUTER_PORT, REGISTRY_PORT } from "../config";
import axios from "axios";
import { generateRsaKeyPair, exportPubKey, exportPrvKey } from "../crypto";

let lastReceivedEncryptedMessage: string | null = null;
let lastReceivedDecryptedMessage: string | null = null;
let lastMessageDestination: number | null = null;
let lastReceivedMessage: string | null = null;
let lastSentMessage: string | null = null;

export async function simpleOnionRouter(nodeId: number) {
  const { publicKey, privateKey } = await generateRsaKeyPair();
  const pubKeyString = await exportPubKey(publicKey);
  const prvKeyString = await exportPrvKey(privateKey);

  // Register the node on the registry
  await axios.post(`http://localhost:${REGISTRY_PORT}/registerNode`, {
    nodeId,
    pubKey: pubKeyString,
  });

  const onionRouter = express();
  onionRouter.use(express.json());
  onionRouter.use(bodyParser.json());

  onionRouter.get("/status", (req, res) => {
    res.send("live");
  });

  onionRouter.get("/getLastReceivedEncryptedMessage", (req, res) => {
    res.status(200).json({ result: lastReceivedEncryptedMessage });
  });

  onionRouter.get("/getLastReceivedDecryptedMessage", (req, res) => {
    res.status(200).json({ result: lastReceivedDecryptedMessage });
  });

  onionRouter.get("/getLastMessageDestination", (req, res) => {
    res.status(200).json({ result: lastMessageDestination });
  });

  onionRouter.get("/getLastReceivedMessage", (req, res) => {
    res.status(200).json({ result: lastReceivedMessage });
  });

  onionRouter.get("/getLastSentMessage", (req, res) => {
    res.status(200).json({ result: lastSentMessage });
  });

  onionRouter.get("/getPrivateKey", (req, res) => {
    res.status(200).json({ result: prvKeyString });
  });

  const server = onionRouter.listen(BASE_ONION_ROUTER_PORT + nodeId, () => {
    console.log(
      `Onion router ${nodeId} is listening on port ${
        BASE_ONION_ROUTER_PORT + nodeId
      }`
    );
  });

  return server;
}
