import os
from web3 import Web3

SEPOLIA_RPC_URL = os.getenv("SEPOLIA_RPC_URL", "")
CONTRACT_ADDRESS = os.getenv("CONTRACT_ADDRESS", "")
PRIVATE_KEY = os.getenv("PRIVATE_KEY", "")
ACCOUNT_ADDRESS = os.getenv("ACCOUNT_ADDRESS", "")

ABI = [
    {"inputs":[{"internalType":"bytes32","name":"hash","type":"bytes32"},{"internalType":"string","name":"reportId","type":"string"}],"name":"storeReportHash","outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"bytes32","name":"hash","type":"bytes32"}],"name":"verifyReportHash","outputs":[{"internalType":"bool","name":"exists","type":"bool"},{"internalType":"string","name":"reportId","type":"string"},{"internalType":"uint256","name":"timestamp","type":"uint256"}],"stateMutability":"view","type":"function"}
]

def get_w3():
    if not SEPOLIA_RPC_URL or not CONTRACT_ADDRESS or not PRIVATE_KEY or not ACCOUNT_ADDRESS:
        return None, None, None
    w3 = Web3(Web3.HTTPProvider(SEPOLIA_RPC_URL))
    contract = w3.eth.contract(address=Web3.to_checksum_address(CONTRACT_ADDRESS), abi=ABI)
    return w3, contract, Web3.to_checksum_address(ACCOUNT_ADDRESS)

def store_hash_on_chain(sha256_hex: str, report_id: str):
    w3, contract, account = get_w3()
    if not w3:
        return None
    nonce = w3.eth.get_transaction_count(account)
    tx = contract.functions.storeReportHash(Web3.to_bytes(hexstr=sha256_hex), report_id).build_transaction({
        "from": account,
        "nonce": nonce,
        "gas": 300000,
        "maxFeePerGas": w3.to_wei("2", "gwei"),
        "maxPriorityFeePerGas": w3.to_wei("1", "gwei"),
    })
    signed = w3.eth.account.sign_transaction(tx, private_key=PRIVATE_KEY)
    tx_hash = w3.eth.send_raw_transaction(signed.rawTransaction)
    return w3.to_hex(tx_hash)

