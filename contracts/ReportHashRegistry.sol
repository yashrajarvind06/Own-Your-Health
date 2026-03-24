// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ReportHashRegistry {
    struct Record {
        string reportId;
        uint256 timestamp;
    }

    mapping(bytes32 => Record) private records;

    event ReportHashStored(bytes32 indexed hash, string reportId, uint256 timestamp);

    function storeReportHash(bytes32 hash, string memory reportId) public {
        require(bytes(records[hash].reportId).length == 0, "Already stored");
        records[hash] = Record({reportId: reportId, timestamp: block.timestamp});
        emit ReportHashStored(hash, reportId, block.timestamp);
    }

    function verifyReportHash(bytes32 hash) public view returns (bool exists, string memory reportId, uint256 timestamp) {
        Record memory r = records[hash];
        if (bytes(r.reportId).length == 0) {
            return (false, "", 0);
        }
        return (true, r.reportId, r.timestamp);
    }
}
