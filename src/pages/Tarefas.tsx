import { useEffect, useState } from 'react';
import {
  Container, Row, Col, Card, Button, Modal, Form, Table, InputGroup, FormControl, Spinner, Dropdown
} from 'react-bootstrap';
import {
  collection, addDoc, getDocs, doc, updateDoc, query, where, getDoc
} from 'firebase/firestore';
import { db } from '../services/firebase';
import AppLayout from '../components/AppLayout';
// TODO Resolver depois
// import { PlusCircle } from 'react-bootstrap-icons';
import { useAuth } from '../contexts/AuthContext';
import Paginacao from '../components/Paginacao';


// Ícones para o cabeçalho e abas
import { GraduationCap, Plus, Eye } from "lucide-react";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faX, faCircleExclamation, faCheck, faNoteSticky, faComment } from '@fortawesome/free-solid-svg-icons';

interface Entrega {
  id: string;
  alunoId: string;
  tarefaId: string;
  dataEntrega: string;
  status: string;
  dataConclusao?: string;
  anexoUrl?: string;
  observacoes?: string;
}


interface Aluno {
  id: string;
  nome: string;
  turmaId: string;
}

interface Tarefa {
  id: string;
  materiaId: string;
  descricao: string;
  turmaId: string;
  dataEntrega: string;
}

interface Turma {
  id: string;
  nome: string;
}

interface Materia {
  id: string;
  nome: string;
}

interface Vinculo {
  professorId: string;
  materiaId: string;
  turmaId: string;
}

export default function Tarefas() {
  const { userData } = useAuth()!;
  const isAdmin = userData?.tipo === 'administradores';

  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [materias, setMaterias] = useState<Materia[]>([]);
  const [vinculos, setVinculos] = useState<Vinculo[]>([]);

  const [busca, setBusca] = useState('');
  const [filtroTurma, setFiltroTurma] = useState('');
  const [filtroMateria, setFiltroMateria] = useState('');
  const [loading, setLoading] = useState(true);
  const [alunos, setAlunos] = useState<Aluno[]>([]);


  const [showModal, setShowModal] = useState(false);
  const [materiaSelecionada, setMateriaSelecionada] = useState('');
  const [descricao, setDescricao] = useState('');
  const [turmaId, setTurmaId] = useState('');
  const [dataEntrega, setDataEntrega] = useState('');
  const [editandoId, setEditandoId] = useState<string | null>(null);

  const [paginaAtual, setPaginaAtual] = useState(1);
  const tarefasPorPagina = 10;

  // Estado para abas
  const [activeTab, setActiveTab] = useState<'cadastro' | 'acompanhamento'>('acompanhamento');
  const [entregas, setEntregas] = useState<Entrega[]>([]);

  const [observacaoAberta, setObservacaoAberta] = useState<{
    alunoId: string | null;
    texto: string;
  }>({ alunoId: null, texto: "" });


  useEffect(() => {
    if (!userData) return;
    fetchData();
  }, [userData]);

  // Observação handlers movidos para o escopo do componente
  const abrirObservacao = (alunoId: string, textoAtual: string = "") => {
    setObservacaoAberta({ alunoId, texto: textoAtual });
  };
  const fecharObservacao = () => {
    setObservacaoAberta({ alunoId: null, texto: "" });
  };
  const salvarObservacao = async () => {
    if (!observacaoAberta.alunoId || !busca || !filtroMateria) return;

    const tarefa = tarefas.find(t => t.descricao === busca && t.materiaId === filtroMateria);
    if (!tarefa) return;

    const entregaExistente = entregas.find(e =>
      e.alunoId === observacaoAberta.alunoId &&
      e.tarefaId === tarefa.id
    );

    if (entregaExistente) {
      const entregaRef = doc(db, 'entregas', entregaExistente.id);
      await updateDoc(entregaRef, { observacoes: observacaoAberta.texto });

      setEntregas(prev =>
        prev.map(e =>
          e.id === entregaExistente.id ? { ...e, observacoes: observacaoAberta.texto } : e
        )
      );
    } else {
      const novaEntrega = {
        alunoId: observacaoAberta.alunoId,
        tarefaId: tarefa.id,
        status: '',
        dataEntrega: new Date().toISOString(),
        observacoes: observacaoAberta.texto
      };

      const docRef = await addDoc(collection(db, 'entregas'), novaEntrega);

      setEntregas(prev => [...prev, { id: docRef.id, ...novaEntrega }]);
    }

    fecharObservacao();
  };


  const fetchData = async () => {
    setLoading(true);

    let turmaDocs = [];
    if (isAdmin) {
      turmaDocs = (await getDocs(collection(db, 'turmas'))).docs;
    } else {
      let vincSnap;
      if (!userData) {
        setLoading(false);
        return;
      }
      vincSnap = await getDocs(query(collection(db, 'professores_materias'), where('professorId', '==', userData.uid)));
      const vincList = vincSnap.docs.map(d => d.data() as Vinculo);
      setVinculos(vincList);

      const turmaIds = [...new Set(vincList.map(v => v.turmaId))];
      turmaDocs = await Promise.all(
        turmaIds.map(async id => await getDoc(doc(db, 'turmas', id)))
      );
    }
    setTurmas(turmaDocs.map(d => ({ id: d.id, nome: d.data()?.nome || '-' })));

    const vincSnap = isAdmin
      ? await getDocs(collection(db, 'professores_materias'))
      : userData
        ? await getDocs(query(collection(db, 'professores_materias'), where('professorId', '==', userData.uid)))
        : { docs: [] };

    const vincList = vincSnap.docs.map(d => d.data() as Vinculo);
    setVinculos(vincList);

    const entregasSnap = await getDocs(collection(db, 'entregas'));
    setEntregas(entregasSnap.docs.map(doc => {
      const { id: _id, ...data } = doc.data() as Entrega;
      return { id: doc.id, ...data };
    }));

    const materiaIds = [...new Set(vincList.map(v => v.materiaId))];
    const materiasSnap = await Promise.all(
      materiaIds.map(async id => {
        const m = await getDoc(doc(db, 'materias', id));
        return { id: m.id, nome: m.data()?.nome || '-' };
      })
    );
    setMaterias(materiasSnap);

    const tarefasSnap = await getDocs(collection(db, 'tarefas'));
    const tarefasFiltradas = isAdmin
      ? tarefasSnap.docs
      : tarefasSnap.docs.filter(doc => materiaIds.includes(doc.data().materiaId));

    setTurmas(turmaDocs.map(d => ({ id: d.id, nome: d.data()?.nome || '-' })));
    setTarefas(tarefasFiltradas.map(d => ({ id: d.id, ...(d.data() as any) })));
    setLoading(false);
    const alunosSnap = await getDocs(collection(db, 'alunos'));
    setAlunos(alunosSnap.docs.map(doc => {
      const data = doc.data() as Omit<Aluno, 'id'>;
      return { ...data, id: doc.id };
    }));

  };

  const handleClose = () => {
    setMateriaSelecionada('');
    setDescricao('');
    setTurmaId('');
    setDataEntrega('');
    setEditandoId(null);
    setShowModal(false);
  };

  const handleSalvar = async () => {
    if (!materiaSelecionada || !descricao || !turmaId || !dataEntrega) return;
    if (!userData) return;
    const payload = { materiaId: materiaSelecionada, descricao, turmaId, dataEntrega, professorId: userData.uid };
    if (editandoId) {
      await updateDoc(doc(db, 'tarefas', editandoId), payload);
    } else {
      await addDoc(collection(db, 'tarefas'), payload);
    }
    handleClose();
    fetchData();
  };
  const tarefasFiltradas = tarefas.filter(t =>
    (!filtroTurma || t.turmaId === filtroTurma) &&
    (!filtroMateria || t.materiaId === filtroMateria) &&
    (busca === '' ||
      materias.find(m => m.id === t.materiaId)?.nome.toLowerCase().includes(busca.toLowerCase()) ||
      t.descricao.toLowerCase().includes(busca.toLowerCase()))
  );
  const atualizarEntrega = async (alunoId: string, status: string) => {
    const tarefa = tarefas.find(t => t.descricao === busca && t.materiaId === filtroMateria);
    if (!tarefa) return;

    const entregaExistente = entregas.find(e => e.alunoId === alunoId && e.tarefaId === tarefa.id);

    if (entregaExistente) {
      const entregaRef = doc(db, 'entregas', entregaExistente.id);
      await updateDoc(entregaRef, { status });

      // Atualiza o estado local da entrega modificada
      setEntregas(prev =>
        prev.map(e =>
          e.id === entregaExistente.id ? { ...e, status } : e
        )
      );
    } else {
      const novaEntrega = {
        alunoId,
        tarefaId: tarefa.id,
        status,
        dataEntrega: new Date().toISOString(),
      };

      const docRef = await addDoc(collection(db, 'entregas'), novaEntrega);

      // Adiciona nova entrega ao estado local
      setEntregas(prev => [
        ...prev,
        { id: docRef.id, ...novaEntrega }
      ]);
    }

  };


  const tarefasOrdenadas = [...tarefasFiltradas].sort((a, b) => new Date(b.dataEntrega).getTime() - new Date(a.dataEntrega).getTime());
  const totalPaginas = Math.ceil(tarefasOrdenadas.length / tarefasPorPagina);
  const tarefasPaginadas = tarefasOrdenadas.slice((paginaAtual - 1) * tarefasPorPagina, paginaAtual * tarefasPorPagina);
  const alunosFiltrados = filtroTurma
    ? alunos.filter(aluno => aluno.turmaId === filtroTurma)
    : [];


  function handleExcluir(_id: string): void {
    throw new Error('Function not implemented.');
  }

  return (
    <AppLayout>
      <Container className="my-4">
        <div className="min-h-screen bg-gray-50">
          {/* Header */}
          <div className="bg-white border-bottom border-gray-200">
            <div className="container px-4">
              <div className="d-flex align-items-center justify-content-between py-4">
                <div className="d-flex align-items-center gap-3">
                  <div className="d-flex align-items-center justify-content-center rounded bg-primary" style={{ width: 48, height: 48 }}>
                    <GraduationCap size={24} color="#fff" />
                  </div>
                  <div>
                    <h1 className="fs-3 fw-bold text-dark mb-0">Gerenciamento de Tarefas</h1>
                    <p className="text-muted mb-0" style={{ fontSize: 14 }}>MobClassApp - Portal do Professor</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="bg-white border-bottom border-gray-200">
            <div className="container px-4">
              <div className="d-flex gap-3 py-3">
                <Button
                  variant={activeTab === 'cadastro' ? 'primary' : 'outline-primary'}
                  className="d-flex align-items-center gap-2"
                  onClick={() => setActiveTab('cadastro')}
                >
                  <Plus size={18} />
                  <span>Cadastro de Atividade</span>
                </Button>
                <Button
                  variant={activeTab === 'acompanhamento' ? 'primary' : 'outline-primary'}
                  className="d-flex align-items-center gap-2"
                  onClick={() => setActiveTab('acompanhamento')}
                >
                  <Eye size={18} />
                  <span>Acompanhamento</span>
                </Button>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="container py-4">
            {activeTab === 'acompanhamento' && (
              <>

                <Row className="justify-content-between align-items-center mb-3">
                  <Col>
                    <h3 className="text-primary">Acompanhamento de Atividades</h3>
                  </Col>
                </Row>

                <Row className="mb-3">
                  <Col md={4}>
                    <Form.Select value={filtroTurma} onChange={e => setFiltroTurma(e.target.value)}>
                      <option value="">Todas as turmas</option>
                      {[...turmas]
                        .sort((a, b) => a.nome.localeCompare(b.nome))
                        .map(t => (
                          <option key={t.id} value={t.id}>{t.nome}</option>
                        ))}
                    </Form.Select>
                  </Col>
                  <Col md={4}>
                    <Form.Select
                      value={filtroMateria}
                      onChange={e => {
                        setFiltroMateria(e.target.value);
                        setBusca(''); // Limpa busca por descrição ao trocar matéria
                        setPaginaAtual(1); // Volta para a primeira página ao filtrar
                      }}
                    >
                      <option value="">Todas as matérias</option>
                      {materias.map(m => (
                        <option key={m.id} value={m.id}>{m.nome}</option>
                      ))}
                    </Form.Select>
                  </Col>
                  <Col md={4}>
                    <Form.Select
                      value={busca}
                      onChange={e => setBusca(e.target.value)}
                      disabled={!filtroMateria}
                    >
                      <option value="">Selecione uma atividade</option>
                      {[...new Set(
                        tarefas
                          .filter(t => !filtroMateria || t.materiaId === filtroMateria)
                          .map(t => t.descricao)
                      )]
                        .sort()
                        .map(desc => (
                          <option key={desc} value={desc}>{desc}</option>
                        ))}
                    </Form.Select>
                  </Col>
                </Row>

                {loading ? (
                  <div className="d-flex justify-content-center align-items-center py-5">
                    <Spinner animation="border" />
                  </div>
                ) : (
                  <Card className="shadow-sm">
                    <Card.Body>
                      {filtroTurma && filtroMateria && busca ? (
                        <>
                          <Table responsive bordered hover>
                            <thead className="table-light">
                              <tr>
                                <th>Status</th>
                                <th>Aluno</th>
                                <th style={{ whiteSpace: 'nowrap' }}>Data Conclusão</th>
                                <th>Anexo</th>
                                <th>Observações</th>
                                <th>Ações</th>
                              </tr>
                            </thead>
                            <tbody>
                              {[...alunosFiltrados]
                                .sort((a, b) => a.nome.localeCompare(b.nome))
                                .slice((paginaAtual - 1) * tarefasPorPagina, paginaAtual * tarefasPorPagina)
                                .map(aluno => {
                                  const entrega = entregas.find(e =>
                                    e.alunoId === aluno.id &&
                                    e.tarefaId === tarefas.find(t => t.descricao === busca && t.materiaId === filtroMateria)?.id
                                  );
                                  return (
                                    <tr key={aluno.id}>
                                      <td className="text-center">
                                        {(() => {
                                          if (entrega?.status === 'concluida') {
                                            return (
                                              <FontAwesomeIcon
                                                icon={faCheck}
                                                style={{ color: "#2fae2d" }}
                                              />
                                            );
                                          } else if (entrega?.status === 'pendente') {
                                            return (
                                              <FontAwesomeIcon
                                                icon={faCircleExclamation}
                                                style={{ color: "#FFD43B" }}
                                              />
                                            );
                                          } else {
                                            return <FontAwesomeIcon icon={faX} style={{ color: "#dc3545" }} />;
                                          }
                                        })()}
                                      </td>
                                      <td style={{ whiteSpace: 'nowrap', maxWidth: 300, overflowX: 'auto' }}>{aluno.nome}</td>
                                      <td>{entrega?.dataConclusao ?? '-'}</td>
                                      <td>
                                        {entrega?.anexoUrl ? (
                                          <a
                                            href={entrega.anexoUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{ color: "#3b82f6" }}
                                          >
                                            Ver Anexo
                                          </a>
                                        ) : (
                                          <span style={{ color: "rgb(33 37 41 / 75%)" }}>Sem anexo</span>
                                        )}
                                      </td>
                                        <td className="text-center">
                                          <FontAwesomeIcon
                                            icon={faComment}
                                            size="lg"
                                            style={{
                                              color: entrega?.observacoes && entrega.observacoes.trim() !== "" ? "#FFD43B" : "#212529",
                                              cursor: "pointer"
                                            }}
                                            onClick={() => abrirObservacao(aluno.id, entrega?.observacoes ?? "")}
                                          />
                                        </td>
                                      <td className="d-flex flex-column gap-2" style={{ whiteSpace: 'nowrap' }}>
                                        <div className="d-flex gap-2">
                                          <Button variant="success" size="sm" onClick={() => atualizarEntrega(aluno.id, 'concluida')}>Confirmar</Button>
                                          <Button variant="danger" size="sm" onClick={() => atualizarEntrega(aluno.id, 'nao_entregue')}>Não Entregue</Button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                            </tbody>
                          </Table>
                          <Paginacao
                            paginaAtual={paginaAtual}
                            totalPaginas={Math.ceil(alunosFiltrados.length / tarefasPorPagina)}
                            aoMudarPagina={setPaginaAtual}
                          />
                        </>
                      ) : (
                        <div className="text-center text-muted py-5">
                          <FontAwesomeIcon icon={faCircleExclamation} size="2x" className="mb-3" />
                          <div>Selecione a turma, matéria e atividade para visualizar os alunos.</div>
                        </div>
                      )}
                    </Card.Body>
                  </Card>
                )}
                <Modal show={!!observacaoAberta.alunoId} onHide={fecharObservacao} centered>
                  <Modal.Header closeButton>
                    <Modal.Title>Observação</Modal.Title>
                  </Modal.Header>
                  <Modal.Body>
                    <Form>
                      <Form.Group>
                        <Form.Label>Observação</Form.Label>
                        <Form.Control
                          as="textarea"
                          rows={4}
                          value={observacaoAberta.texto}
                          onChange={e => setObservacaoAberta({ ...observacaoAberta, texto: e.target.value })}
                        />
                      </Form.Group>
                    </Form>
                  </Modal.Body>
                  <Modal.Footer>
                    <Button variant="secondary" onClick={fecharObservacao}>
                      Cancelar
                    </Button>
                    <Button variant="primary" onClick={salvarObservacao}>
                      Salvar
                    </Button>
                  </Modal.Footer>
                </Modal>

                <Modal show={showModal} onHide={handleClose} centered>
                  <Modal.Header closeButton>
                    <Modal.Title>{editandoId ? 'Editar Tarefa' : 'Nova Tarefa'}</Modal.Title>
                  </Modal.Header>
                  <Modal.Body>
                    <Form>
                      <Form.Group className="mb-3">
                        <Form.Label>Turma</Form.Label>
                        <Form.Select value={turmaId} onChange={e => setTurmaId(e.target.value)}>
                          <option value="">Selecione a turma</option>
                          {turmas.map(t => (
                            <option key={t.id} value={t.id}>{t.nome}</option>
                          ))}
                        </Form.Select>
                      </Form.Group>
                      <Form.Group className="mb-3">
                        <Form.Label>Matéria</Form.Label>
                        <Form.Select
                          value={materiaSelecionada}
                          onChange={e => setMateriaSelecionada(e.target.value)}
                          disabled={!turmaId}
                        >
                          <option value="">Selecione a matéria</option>
                          {vinculos
                            .filter(v => v.turmaId === turmaId)
                            .map(v => {
                              const materia = materias.find(m => m.id === v.materiaId);
                              return materia ? (
                                <option key={materia.id} value={materia.id}>{materia.nome}</option>
                              ) : null;
                            })}
                        </Form.Select>
                      </Form.Group>
                      <Form.Group className="mb-3">
                        <Form.Label>Descrição</Form.Label>
                        <Form.Control
                          as="textarea"
                          rows={2}
                          value={descricao}
                          onChange={e => setDescricao(e.target.value)}
                        />
                      </Form.Group>
                      <Form.Group className="mb-3">
                        <Form.Label>Data de Entrega</Form.Label>
                        <Form.Control
                          type="date"
                          value={dataEntrega}
                          onChange={e => setDataEntrega(e.target.value)}
                        />
                      </Form.Group>
                    </Form>
                  </Modal.Body>
                  <Modal.Footer>
                    <Button variant="secondary" onClick={handleClose}>Cancelar</Button>
                    <Button variant="primary" onClick={handleSalvar}>Salvar</Button>
                  </Modal.Footer>
                </Modal>
              </>
            )}

            {activeTab === 'cadastro' && (
              <div className="d-flex flex-column align-items-center justify-content-center py-5">
                <div className="d-flex align-items-center justify-content-center rounded-circle bg-primary bg-opacity-10 mb-3" style={{ width: 64, height: 64 }}>
                  <Plus size={32} color="#0d6efd" />
                </div>
                <h3 className="fw-semibold text-dark mb-2">
                  Formulário de Cadastro de Atividade
                </h3>
                <p className="text-muted mb-4" style={{ maxWidth: 400 }}>
                  Preencha o formulário para cadastrar uma nova atividade.
                </p>
                <Button variant="primary" onClick={() => setShowModal(true)}>
                  <Plus className="me-2" size={18} /> Nova Tarefa
                </Button>
                <Modal show={showModal} onHide={handleClose} centered>
                  <Modal.Header closeButton>
                    <Modal.Title>{editandoId ? 'Editar Tarefa' : 'Nova Tarefa'}</Modal.Title>
                  </Modal.Header>
                  <Modal.Body>
                    <Form>
                      <Form.Group className="mb-3">
                        <Form.Label>Turma</Form.Label>
                        <Form.Select value={turmaId} onChange={e => setTurmaId(e.target.value)}>
                          <option value="">Selecione a turma</option>
                          {turmas.map(t => (
                            <option key={t.id} value={t.id}>{t.nome}</option>
                          ))}
                        </Form.Select>
                      </Form.Group>
                      <Form.Group className="mb-3">
                        <Form.Label>Matéria</Form.Label>
                        <Form.Select
                          value={materiaSelecionada}
                          onChange={e => setMateriaSelecionada(e.target.value)}
                          disabled={!turmaId}
                        >
                          <option value="">Selecione a matéria</option>
                          {vinculos
                            .filter(v => v.turmaId === turmaId)
                            .map(v => {
                              const materia = materias.find(m => m.id === v.materiaId);
                              return materia ? (
                                <option key={materia.id} value={materia.id}>{materia.nome}</option>
                              ) : null;
                            })}
                        </Form.Select>
                      </Form.Group>
                      <Form.Group className="mb-3">
                        <Form.Label>Descrição</Form.Label>
                        <Form.Control
                          as="textarea"
                          rows={2}
                          value={descricao}
                          onChange={e => setDescricao(e.target.value)}
                        />
                      </Form.Group>
                      <Form.Group className="mb-3">
                        <Form.Label>Data de Entrega</Form.Label>
                        <Form.Control
                          type="date"
                          value={dataEntrega}
                          onChange={e => setDataEntrega(e.target.value)}
                        />
                      </Form.Group>
                    </Form>
                  </Modal.Body>
                  <Modal.Footer>
                    <Button variant="secondary" onClick={handleClose}>Cancelar</Button>
                    <Button variant="primary" onClick={handleSalvar}>Salvar</Button>
                  </Modal.Footer>
                </Modal>
              </div>
            )}
          </div>
        </div>
      </Container>
    </AppLayout>
  );
}