import { bufferToHex } from 'ethereumjs-util'
import { getBlockHeader } from '../helpers/blocks.js'
import { getTxBytes, getReceiptBytes, getReceiptProof, getTxProof, verifyTxProof } from '../helpers/proofs.js'
import MerkleTree from '../helpers/merkle-tree.js'

let headerNumber = 0

export async function build(event) {
  const blockHeader = await getBlockHeader(event.block)
  const tree = new MerkleTree([blockHeader])
  const receiptProof = await getReceiptProof(event.receipt, event.block, null /* web3 */, [event.receipt])
  const txProof = await getTxProof(event.tx, event.block)
  assert.ok(verifyTxProof(receiptProof), 'verify receipt proof failed in js')

  headerNumber += 1
  return {
    header: { number: headerNumber, root: tree.getRoot(), start: event.receipt.blockNumber },
    receipt: getReceiptBytes(event.receipt), // rlp encoded
    receiptParentNodes: receiptProof.parentNodes,
    tx: getTxBytes(event.tx), // rlp encoded
    txParentNodes: txProof.parentNodes,
    path: Buffer.concat([Buffer.from('00', 'hex'), receiptProof.path]),
    number: event.receipt.blockNumber,
    timestamp: event.block.timestamp,
    transactionsRoot: Buffer.from(event.block.transactionsRoot.slice(2), 'hex'),
    receiptsRoot: Buffer.from(event.block.receiptsRoot.slice(2), 'hex'),
    proof: tree.getProof(blockHeader)
  }
}

// submit checkpoint
export async function submitCheckpoint(checkpointManager, receiptObj) {
  const tx = await web3.eth.getTransaction(receiptObj.transactionHash)
  const receipt = await web3.eth.getTransactionReceipt(receiptObj.transactionHash)
  const block = await web3.eth.getBlock(receipt.blockHash, true /* returnTransactionObjects */)
  const event = {
    tx,
    receipt,
    block
  }
  // build checkpoint
  const checkpointData = await build(event)
  const root = bufferToHex(checkpointData.header.root)

  // submit checkpoint including burn (withdraw) tx
  await checkpointManager.setCheckpoint(root, block.number, block.number)

  // return checkpoint data
  return checkpointData
}
