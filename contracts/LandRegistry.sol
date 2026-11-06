// SPDX-License-Identifier: MIT
pragma solidity >=0.8.19 <0.9.0;

contract LandRegistry {
    address public admin;
    uint256 public propertyCount;

    struct Land {
        uint256 id;
        string location;
        uint256 area;
        uint256 price;
        address currentOwner;
        bytes32 documentHash;
        string documentCID;
        uint256 registeredAt;
        bool isRegistered;
    }

    struct OwnershipRecord {
        address owner;
        uint256 timestamp;
    }

    mapping(uint256 => Land) private lands;
    mapping(address => bool) public registrars;
    mapping(uint256 => OwnershipRecord[]) private ownershipHistory;
    uint256[] private landIds;

    event RegistrarUpdated(address indexed registrar, bool status);
    event LandRegistered(uint256 indexed id, string location, address indexed owner);
    event OwnershipTransferred(uint256 indexed id, address indexed previousOwner, address indexed newOwner);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can perform this");
        _;
    }

    modifier onlyRegistrar() {
        require(registrars[msg.sender], "Only authorized registrars can register land");
        _;
    }

    constructor() {
        admin = msg.sender;
        registrars[msg.sender] = true;
        emit RegistrarUpdated(msg.sender, true);
    }

    function addRegistrar(address registrar) external onlyAdmin {
        require(registrar != address(0), "Invalid registrar address");
        require(!registrars[registrar], "Address is already a registrar");
        registrars[registrar] = true;
        emit RegistrarUpdated(registrar, true);
    }

    function removeRegistrar(address registrar) external onlyAdmin {
        require(registrar != address(0), "Invalid registrar address");
        require(registrars[registrar], "Address is not a registrar");
        registrars[registrar] = false;
        emit RegistrarUpdated(registrar, false);
    }

    function registerLand(
        string calldata location,
        uint256 area,
        uint256 price,
        address initialOwner,
        bytes32 documentHash,
        string calldata documentCID
    ) external onlyRegistrar returns (uint256 id) {
        require(bytes(location).length > 0, "Location is required");
        require(area > 0, "Area must be greater than zero");
        require(initialOwner != address(0), "Invalid owner address");
        require(documentHash != bytes32(0), "Document hash is required");
        require(bytes(documentCID).length > 0, "Document CID is required");

        id = ++propertyCount;
        lands[id] = Land({
            id: id,
            location: location,
            area: area,
            price: price,
            currentOwner: initialOwner,
            documentHash: documentHash,
            documentCID: documentCID,
            registeredAt: block.timestamp,
            isRegistered: true
        });

        landIds.push(id);
        ownershipHistory[id].push(OwnershipRecord(initialOwner, block.timestamp));
        emit LandRegistered(id, location, initialOwner);
    }

    function transferOwnership(uint256 id, address newOwner) external {
        Land storage land = lands[id];
        require(land.isRegistered, "Land not found");
        require(land.currentOwner == msg.sender, "Only the current owner can transfer ownership");
        require(newOwner != address(0), "Invalid owner address");
        require(newOwner != land.currentOwner, "New owner is already the current owner");

        address previousOwner = land.currentOwner;
        land.currentOwner = newOwner;
        ownershipHistory[id].push(OwnershipRecord(newOwner, block.timestamp));
        emit OwnershipTransferred(id, previousOwner, newOwner);
    }

    function getLand(uint256 id)
        external
        view
        returns (
            uint256 landId,
            string memory location,
            uint256 area,
            uint256 price,
            address currentOwner,
            bytes32 documentHash,
            string memory documentCID,
            uint256 registeredAt,
            bool isRegistered
        )
    {
        require(lands[id].isRegistered, "Land not found");
        Land storage land = lands[id];
        return (
            land.id,
            land.location,
            land.area,
            land.price,
            land.currentOwner,
            land.documentHash,
            land.documentCID,
            land.registeredAt,
            land.isRegistered
        );
    }

    function getLandIds() external view returns (uint256[] memory) {
        return landIds;
    }

    function getOwnershipHistory(uint256 id) external view returns (OwnershipRecord[] memory) {
        require(lands[id].isRegistered, "Land not found");
        return ownershipHistory[id];
    }

    function verifyDocument(uint256 id, bytes32 hash) external view returns (bool) {
        require(lands[id].isRegistered, "Land not found");
        return lands[id].documentHash == hash;
    }
}
