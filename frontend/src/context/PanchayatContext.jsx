import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext';

const PanchayatContext = createContext(null);
export const usePanchayat = () => useContext(PanchayatContext);

export const PanchayatProvider = ({ children }) => {
  const { user } = useAuth();
  const [selectedDistrict, setSelectedDistrict] = useState(null);
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [selectedPanchayat, setSelectedPanchayat] = useState(null);
  const [districtId, setDistrictId] = useState(null); // always tracks current district ID

  const [districts, setDistricts] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [panchayats, setPanchayats] = useState([]);
  const [loadingLocations, setLoadingLocations] = useState(false);

  useEffect(() => {
    if (!user) {
      setSelectedDistrict(null);
      setSelectedBlock(null);
      setSelectedPanchayat(null);
      setDistrictId(null);
      setDistricts([]);
      setBlocks([]);
      setPanchayats([]);
      return;
    }

    const fetchHierarchy = async () => {
      setLoadingLocations(true);
      try {
        const res = await axios.get('/api/locations/hierarchy');
        const scopedDistricts = res.data.districts || [];
        setDistricts(scopedDistricts);

        if (user.role === 'district') {
          const myDistrict = scopedDistricts[0] || null;
          setSelectedDistrict(myDistrict);
          setDistrictId(myDistrict?.id || null);
          setSelectedBlock(null);
          setSelectedPanchayat(null);
          setPanchayats([]);

          if (myDistrict) {
            const blockRes = await axios.get(`/api/locations/blocks/${myDistrict.id}`);
            setBlocks(blockRes.data);
          } else {
            setBlocks([]);
          }
        } else if (user.role === 'block') {
          const myDistrict = scopedDistricts[0] || null;
          setSelectedDistrict(myDistrict);
          setDistrictId(myDistrict?.id || null);
          setSelectedPanchayat(null);

          if (myDistrict) {
            const blockRes = await axios.get(`/api/locations/blocks/${myDistrict.id}`);
            const districtBlocks = blockRes.data;
            setBlocks(districtBlocks);

            const myBlock = districtBlocks.find(b => b.id === user.location_id) || null;
            setSelectedBlock(myBlock);

            if (myBlock) {
              const panchayatRes = await axios.get(`/api/locations/panchayats/${myBlock.id}`);
              setPanchayats(panchayatRes.data);
            } else {
              setPanchayats([]);
            }
          } else {
            setSelectedBlock(null);
            setBlocks([]);
            setPanchayats([]);
          }
        } else if (user.role === 'panchayat') {
          // Auto-select panchayat and resolve its district
          setSelectedPanchayat({ id: user.location_id, name: user.location_name });
          setSelectedBlock(null);
          setBlocks([]);
          setPanchayats([]);

          // Fetch the district for this panchayat
          const distRes = await axios.get(`/api/locations/district-of-panchayat/${user.location_id}`);
          setDistrictId(distRes.data.district_id);
          setSelectedDistrict({ id: distRes.data.district_id, name: distRes.data.district_name });
        } else {
          setSelectedDistrict(null);
          setSelectedBlock(null);
          setSelectedPanchayat(null);
          setDistrictId(null);
          setBlocks([]);
          setPanchayats([]);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingLocations(false);
      }
    };
    fetchHierarchy();
  }, [user]);

  const selectDistrict = async (district) => {
    setSelectedDistrict(district);
    setDistrictId(district?.id || null);
    setSelectedBlock(null);
    setSelectedPanchayat(null);
    setPanchayats([]);
    if (district) {
      const res = await axios.get(`/api/locations/blocks/${district.id}`);
      setBlocks(res.data);
      if (user.role === 'block') {
        const myBlock = res.data.find(b => b.id === user.location_id);
        if (myBlock) await selectBlock(myBlock);
      }
    } else {
      setBlocks([]);
    }
  };

  const selectBlock = async (block) => {
    setSelectedBlock(block);
    setSelectedPanchayat(null);
    if (block) {
      const res = await axios.get(`/api/locations/panchayats/${block.id}`);
      setPanchayats(res.data);
    } else {
      setPanchayats([]);
    }
  };

  const selectPanchayat = (panchayat) => {
    setSelectedPanchayat(panchayat);
    // districtId is already set from selectDistrict
  };

  return (
    <PanchayatContext.Provider value={{
      selectedDistrict, selectedBlock, selectedPanchayat,
      districtId,
      districts, blocks, panchayats, loadingLocations,
      selectDistrict, selectBlock, selectPanchayat,
    }}>
      {children}
    </PanchayatContext.Provider>
  );
};
