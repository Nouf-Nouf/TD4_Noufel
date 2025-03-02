import bodyParser from "body-parser";
import express from "express";
import { BASE_ONION_ROUTER_PORT, REGISTRY_PORT } from "../config";
import axios from "axios";
import { generateRsaKeyPair, exportPubKey, exportPrvKey, rsaDecrypt, rsaEncrypt } from "../crypto";

let lastReceivedEncryptedMessage: string | null = null;
let lastReceivedDecryptedMessage: string | null = null;
let lastMessageDestination: number | null = null;
let lastReceivedMessage: string | null = null;
let lastSentMessage: string | null = null;

export async function simpleOnionRouter(nodeId: number) {
  const { publicKey, privateKey } = await generateRsaKeyPair();
  const pubKeyString = await exportPubKey(publicKey);
  const prvKeyString = await exportPrvKey(privateKey);

  const onionRouter = express();
  onionRouter.use(express.json());
  onionRouter.use(bodyParser.json());

  // Register the node on the registry
  try {
    await axios.post(`http://localhost:${REGISTRY_PORT}/registerNode`, {
      nodeId,
      pubKey: pubKeyString,
    });
    console.log(`Node ${nodeId} registered with public key: ${pubKeyString}`);
  } catch (error) {
    console.error(`Failed to register node ${nodeId}:`, error);
  }

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

  onionRouter.post("/forwardMessage", async (req, res) => {
    const { encryptedMessage, destination } = req.body;
    lastReceivedEncryptedMessage = encryptedMessage;
    lastMessageDestination = destination;

    try {
      const decryptedMessage = await rsaDecrypt(encryptedMessage, privateKey);
      lastReceivedDecryptedMessage = decryptedMessage;

      if (destination === nodeId) {
        lastReceivedMessage = decryptedMessage;
        res.status(200).send("Message received");
      } else {
        const nextNodePubKey = await getNextNodePubKey(destination);
        const reEncryptedMessage = await rsaEncrypt(decryptedMessage, nextNodePubKey);
        lastSentMessage = reEncryptedMessage;

        await axios.post(`http://localhost:${BASE_ONION_ROUTER_PORT + destination}/forwardMessage`, {
          encryptedMessage: reEncryptedMessage,
          destination,
        });

        res.status(200).send("Message forwarded");
      }
    } catch (error) {
      console.error("Failed to forward message:", error);
      res.status(500).send("Failed to forward message");
    }
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

async function getNextNodePubKey(destination: number): Promise<string> {
  const response = await axios.get(`http://localhost:${REGISTRY_PORT}/getNodeRegistry`);
  const nodes = response.data.nodes;
  const node = nodes.find((n: { nodeId: number }) => n.nodeId === destination);
  if (!node) {
    throw new Error(`Node ${destination} not found`);
  }
  return node.pubKey;
}
