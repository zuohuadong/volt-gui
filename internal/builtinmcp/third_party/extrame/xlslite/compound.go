// SPDX-License-Identifier: Apache-2.0
//
// This file is a hardened, reduced derivative of github.com/extrame/ole2
// (commit d69429661ad7efb189d2ad8074c867265009d0a4). See NOTICE and LICENSE.

package xlslite

import (
	"encoding/binary"
	"fmt"
	"math"
	"unicode/utf16"
)

const (
	freeSector = uint32(0xFFFFFFFF)
	endOfChain = uint32(0xFFFFFFFE)

	compoundHeaderSize = 512
	compoundMiniSize   = 64
)

type compoundLimits struct {
	maxSectors          int
	maxFATSectors       int
	maxDirectoryEntries int
	maxStreamBytes      int
}

type compoundFile struct {
	data       []byte
	sectorSize int
	sectorCnt  int
	fat        []uint32
	miniFat    []uint32
	root       compoundDirectoryEntry
	limits     compoundLimits
}

type compoundDirectoryEntry struct {
	name  string
	type_ byte
	start uint32
	size  uint64
}

func openCompound(data []byte, limits compoundLimits) (*compoundFile, []compoundDirectoryEntry, error) {
	if len(data) < compoundHeaderSize {
		return nil, nil, fmt.Errorf("compound file is shorter than its 512-byte header")
	}
	if string(data[:8]) != "\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" {
		return nil, nil, fmt.Errorf("missing OLE compound-file signature")
	}
	if binary.LittleEndian.Uint16(data[28:30]) != 0xFFFE {
		return nil, nil, fmt.Errorf("unsupported compound-file byte order")
	}
	major := binary.LittleEndian.Uint16(data[26:28])
	sectorShift := binary.LittleEndian.Uint16(data[30:32])
	miniShift := binary.LittleEndian.Uint16(data[32:34])
	if (major != 3 && major != 4) || (sectorShift != 9 && sectorShift != 12) || miniShift != 6 {
		return nil, nil, fmt.Errorf("unsupported compound-file sector format")
	}
	sectorSize := 1 << sectorShift
	if len(data) < compoundHeaderSize+sectorSize || (len(data)-compoundHeaderSize)%sectorSize != 0 {
		return nil, nil, fmt.Errorf("compound file has invalid sector alignment")
	}
	sectorCnt := (len(data) - compoundHeaderSize) / sectorSize
	if sectorCnt > limits.maxSectors {
		return nil, nil, fmt.Errorf("compound file has too many sectors (%d)", sectorCnt)
	}

	c := &compoundFile{data: data, sectorSize: sectorSize, sectorCnt: sectorCnt, limits: limits}
	numFAT := binary.LittleEndian.Uint32(data[44:48])
	if numFAT == 0 || numFAT > uint32(limits.maxFATSectors) || numFAT > uint32(sectorCnt) {
		return nil, nil, fmt.Errorf("compound file has an invalid FAT sector count")
	}
	fatIDs, err := c.readFATSectorIDs(numFAT, binary.LittleEndian.Uint32(data[68:72]), binary.LittleEndian.Uint32(data[72:76]))
	if err != nil {
		return nil, nil, err
	}
	if len(fatIDs) != int(numFAT) {
		return nil, nil, fmt.Errorf("compound file FAT chain is incomplete")
	}
	c.fat, err = c.readFAT(fatIDs)
	if err != nil {
		return nil, nil, err
	}

	entries, err := c.readDirectory(binary.LittleEndian.Uint32(data[48:52]))
	if err != nil {
		return nil, nil, err
	}
	var root *compoundDirectoryEntry
	for i := range entries {
		if entries[i].type_ == 5 {
			root = &entries[i]
			break
		}
	}
	if root == nil {
		return nil, nil, fmt.Errorf("compound file is missing its root directory entry")
	}
	c.root = *root
	miniFATStart := binary.LittleEndian.Uint32(data[60:64])
	numMiniFAT := binary.LittleEndian.Uint32(data[64:68])
	if numMiniFAT > 0 {
		if numMiniFAT > uint32(limits.maxFATSectors) || numMiniFAT > uint32(sectorCnt) {
			return nil, nil, fmt.Errorf("compound file has an invalid mini-FAT sector count")
		}
		miniFATData, err := c.readRegular(miniFATStart, uint64(numMiniFAT)*uint64(sectorSize))
		if err != nil {
			return nil, nil, fmt.Errorf("read mini-FAT: %w", err)
		}
		c.miniFat = make([]uint32, len(miniFATData)/4)
		for i := range c.miniFat {
			c.miniFat[i] = binary.LittleEndian.Uint32(miniFATData[i*4 : i*4+4])
		}
	}
	return c, entries, nil
}

func (c *compoundFile) readFATSectorIDs(numFAT, difatStart, numDifat uint32) ([]uint32, error) {
	ids := make([]uint32, 0, numFAT)
	for i := 0; i < 109 && len(ids) < int(numFAT); i++ {
		id := binary.LittleEndian.Uint32(c.data[76+i*4 : 80+i*4])
		if id != freeSector {
			ids = append(ids, id)
		}
	}
	if len(ids) == int(numFAT) {
		return ids, nil
	}
	if numDifat == 0 || numDifat > uint32(c.sectorCnt) {
		return nil, fmt.Errorf("compound file has an invalid DIFAT chain")
	}
	seen := make(map[uint32]struct{}, numDifat)
	entriesPerSector := c.sectorSize/4 - 1
	for current, visited := difatStart, uint32(0); current != endOfChain && visited < numDifat && len(ids) < int(numFAT); visited++ {
		if !c.validSector(current) {
			return nil, fmt.Errorf("compound file DIFAT references an invalid sector")
		}
		if _, exists := seen[current]; exists {
			return nil, fmt.Errorf("compound file DIFAT chain contains a cycle")
		}
		seen[current] = struct{}{}
		sector := c.sector(current)
		for i := 0; i < entriesPerSector && len(ids) < int(numFAT); i++ {
			id := binary.LittleEndian.Uint32(sector[i*4 : i*4+4])
			if id != freeSector {
				ids = append(ids, id)
			}
		}
		current = binary.LittleEndian.Uint32(sector[c.sectorSize-4:])
	}
	return ids, nil
}

func (c *compoundFile) readFAT(ids []uint32) ([]uint32, error) {
	entriesPerSector := c.sectorSize / 4
	if len(ids) > math.MaxInt/entriesPerSector {
		return nil, fmt.Errorf("compound file FAT is too large")
	}
	fat := make([]uint32, 0, len(ids)*entriesPerSector)
	seen := make(map[uint32]struct{}, len(ids))
	for _, id := range ids {
		if !c.validSector(id) {
			return nil, fmt.Errorf("compound file FAT references an invalid sector")
		}
		if _, exists := seen[id]; exists {
			return nil, fmt.Errorf("compound file repeats a FAT sector")
		}
		seen[id] = struct{}{}
		sector := c.sector(id)
		for i := 0; i < entriesPerSector; i++ {
			fat = append(fat, binary.LittleEndian.Uint32(sector[i*4:i*4+4]))
		}
	}
	if len(fat) < c.sectorCnt {
		return nil, fmt.Errorf("compound file FAT does not cover all sectors")
	}
	return fat, nil
}

func (c *compoundFile) readDirectory(start uint32) ([]compoundDirectoryEntry, error) {
	maxSectors := (c.limits.maxDirectoryEntries + c.sectorSize/128 - 1) / (c.sectorSize / 128)
	data, err := c.readChain(start, maxSectors)
	if err != nil {
		return nil, fmt.Errorf("read directory: %w", err)
	}
	entries := make([]compoundDirectoryEntry, 0, len(data)/128)
	for offset := 0; offset+128 <= len(data); offset += 128 {
		entry, err := parseDirectoryEntry(data[offset : offset+128])
		if err != nil {
			return nil, err
		}
		if entry.type_ == 0 {
			continue
		}
		entries = append(entries, entry)
		if len(entries) > c.limits.maxDirectoryEntries {
			return nil, fmt.Errorf("compound file has too many directory entries")
		}
	}
	if len(entries) == 0 {
		return nil, fmt.Errorf("compound file directory is empty")
	}
	return entries, nil
}

func parseDirectoryEntry(data []byte) (compoundDirectoryEntry, error) {
	entry := compoundDirectoryEntry{type_: data[66], start: binary.LittleEndian.Uint32(data[116:120]), size: binary.LittleEndian.Uint64(data[120:128])}
	if entry.type_ == 0 {
		return entry, nil
	}
	if entry.type_ != 2 && entry.type_ != 5 && entry.type_ != 1 {
		return entry, fmt.Errorf("compound file has an unsupported directory entry type")
	}
	nameBytes := int(binary.LittleEndian.Uint16(data[64:66]))
	if nameBytes < 2 || nameBytes > 64 || nameBytes%2 != 0 {
		return entry, fmt.Errorf("compound file has an invalid directory entry name")
	}
	runes := make([]uint16, nameBytes/2-1)
	for i := range runes {
		runes[i] = binary.LittleEndian.Uint16(data[i*2 : i*2+2])
	}
	entry.name = string(utf16.Decode(runes))
	return entry, nil
}

func (c *compoundFile) readStream(entry compoundDirectoryEntry) ([]byte, error) {
	if entry.size > uint64(c.limits.maxStreamBytes) || entry.size > uint64(math.MaxInt) {
		return nil, fmt.Errorf("compound stream exceeds the configured size limit")
	}
	if entry.size == 0 {
		return []byte{}, nil
	}
	if entry.size < 4096 {
		return c.readMini(entry.start, entry.size)
	}
	return c.readRegular(entry.start, entry.size)
}

func (c *compoundFile) readRegular(start uint32, size uint64) ([]byte, error) {
	if size > uint64(c.limits.maxStreamBytes) || size > uint64(math.MaxInt) {
		return nil, fmt.Errorf("compound stream exceeds the configured size limit")
	}
	if size == 0 {
		return []byte{}, nil
	}
	needed := int((size + uint64(c.sectorSize) - 1) / uint64(c.sectorSize))
	if needed > c.sectorCnt {
		return nil, fmt.Errorf("compound stream length exceeds the available sectors")
	}
	data, err := c.readChainExact(start, needed, c.fat, c.sectorSize)
	if err != nil {
		return nil, err
	}
	return data[:int(size)], nil
}

func (c *compoundFile) readMini(start uint32, size uint64) ([]byte, error) {
	if len(c.miniFat) == 0 {
		return nil, fmt.Errorf("compound file has no mini-FAT for its workbook stream")
	}
	rootData, err := c.readRegular(c.root.start, c.root.size)
	if err != nil {
		return nil, fmt.Errorf("read mini-stream root: %w", err)
	}
	needed := int((size + compoundMiniSize - 1) / compoundMiniSize)
	if needed > len(c.miniFat) || needed*compoundMiniSize > len(rootData) {
		return nil, fmt.Errorf("mini-stream length exceeds the available sectors")
	}
	seen := make(map[uint32]struct{}, needed)
	out := make([]byte, 0, needed*compoundMiniSize)
	for sector, i := start, 0; i < needed; i++ {
		if sector == endOfChain || int(sector) >= len(c.miniFat) {
			return nil, fmt.Errorf("mini-stream chain is shorter than declared")
		}
		if _, exists := seen[sector]; exists {
			return nil, fmt.Errorf("mini-stream chain contains a cycle")
		}
		seen[sector] = struct{}{}
		offset := int(sector) * compoundMiniSize
		if offset < 0 || offset+compoundMiniSize > len(rootData) {
			return nil, fmt.Errorf("mini-stream references bytes outside its root stream")
		}
		out = append(out, rootData[offset:offset+compoundMiniSize]...)
		sector = c.miniFat[sector]
	}
	return out[:int(size)], nil
}

func (c *compoundFile) readChain(start uint32, maxSectors int) ([]byte, error) {
	if maxSectors <= 0 || maxSectors > c.sectorCnt {
		maxSectors = c.sectorCnt
	}
	seen := make(map[uint32]struct{}, maxSectors)
	out := make([]byte, 0, min(maxSectors*c.sectorSize, c.limits.maxStreamBytes))
	for sector, count := start, 0; sector != endOfChain; count++ {
		if count >= maxSectors || !c.validSector(sector) {
			return nil, fmt.Errorf("compound sector chain exceeds its allowed range")
		}
		if _, exists := seen[sector]; exists {
			return nil, fmt.Errorf("compound sector chain contains a cycle")
		}
		seen[sector] = struct{}{}
		out = append(out, c.sector(sector)...)
		sector = c.fat[sector]
	}
	return out, nil
}

func (c *compoundFile) readChainExact(start uint32, needed int, fat []uint32, sectorSize int) ([]byte, error) {
	if needed <= 0 || needed > len(fat) {
		return nil, fmt.Errorf("compound stream has an invalid sector count")
	}
	seen := make(map[uint32]struct{}, needed)
	out := make([]byte, 0, needed*sectorSize)
	for sector, i := start, 0; i < needed; i++ {
		if sector == endOfChain || int(sector) >= len(fat) || !c.validSector(sector) {
			return nil, fmt.Errorf("compound stream chain is shorter than declared")
		}
		if _, exists := seen[sector]; exists {
			return nil, fmt.Errorf("compound stream chain contains a cycle")
		}
		seen[sector] = struct{}{}
		out = append(out, c.sector(sector)...)
		sector = fat[sector]
	}
	return out, nil
}

func (c *compoundFile) sector(id uint32) []byte {
	offset := compoundHeaderSize + int(id)*c.sectorSize
	return c.data[offset : offset+c.sectorSize]
}

func (c *compoundFile) validSector(id uint32) bool {
	return id != freeSector && id != endOfChain && id < uint32(c.sectorCnt)
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
