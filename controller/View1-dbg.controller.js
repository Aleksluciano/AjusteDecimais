sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageBox",
    "sap/ui/core/util/File",
    "sap/m/MessageToast",
    "sap/ui/model/json/JSONModel",
    "sap/ui/thirdparty/jquery",
    "sap/ui/export/Spreadsheet",
    "sap/ui/export/library"
], (Controller, MessageBox, File, MessageToast, JSONModel, jQuery, Spreadsheet, exportLibrary) => {
    "use strict";
    
    // Constantes para a exportação
    const EdmType = exportLibrary.EdmType;

    return Controller.extend("nsdecimals.moduledecimals.controller.View1", {
        onInit() {
            // Modelo para armazenar os dados do CSV e informações do arquivo
            this.getView().setModel(new JSONModel({
                csvData: [],
                fileName: "",
                dadosProcessados: false
            }), "csvModel");
        },
        
        /**
         * Valida se o valor inserido é um número no formato decimal (0,00)
         * Restringe a entrada para ter somente 1 dígito antes da vírgula e 2 depois
         * @param {sap.ui.base.Event} oEvent Evento de mudança do input
         */
        onValidateNumericInput: function(oEvent) {
            const oInput = oEvent.getSource();
            let sValue = oInput.getValue();
            
            // Primeiro limita o comprimento total para máximo 4 caracteres (0,00)
            if (sValue.length > 4) {
                sValue = sValue.substring(0, 4);
                oInput.setValue(sValue);
            }
            
            // Regex para validar número decimal no formato exato 0,00
            const regexExato = /^[0-9]{1},[0-9]{2}$/;
            
            // Regex para validar se está digitando corretamente
            const regexDigitando = /^([0-9]{0,1}(,([0-9]{0,2}))?)?$/;
            
            if (regexExato.test(sValue)) {
                // Formato correto
                oInput.setValueState("Success");
            } else if (regexDigitando.test(sValue)) {
                // Está digitando corretamente, mas ainda não completou
                oInput.setValueState("None");
            } else {
                // Formato inválido
                oInput.setValueState("Error");
                oInput.setValueStateText("Digite um valor no formato 0,00");
            }
            
            // Formata automaticamente o número enquanto digita
            this._formatDecimalInput(oEvent);
        },
        
        /**
         * Função auxiliar para formatar automaticamente a entrada decimal
         * @param {sap.ui.base.Event} oEvent Evento de mudança do input
         * @private
         */
        _formatDecimalInput: function(oEvent) {
            const oInput = oEvent.getSource();
            let sValue = oInput.getValue();
            
            // Se digitou um número e ainda não tem vírgula
            if (/^[0-9]$/.test(sValue) && !sValue.includes(",")) {
                // Adiciona automaticamente a vírgula
                sValue = sValue + ",";
                oInput.setValue(sValue);
            }
            
            // Se tem vírgula e 2 dígitos depois dela, não permite mais dígitos
            if (sValue.includes(",")) {
                const parts = sValue.split(",");
                if (parts.length > 1 && parts[1].length > 2) {
                    // Limita a 2 casas decimais
                    parts[1] = parts[1].substring(0, 2);
                    sValue = parts[0] + "," + parts[1];
                    oInput.setValue(sValue);
                }
            }
            
            // Limita a parte inteira a 1 dígito
            if (sValue.includes(",")) {
                const parts = sValue.split(",");
                if (parts[0].length > 1) {
                    parts[0] = parts[0].substring(parts[0].length - 1);
                    sValue = parts[0] + "," + parts[1];
                    oInput.setValue(sValue);
                }
            }
        },
        
        /**
         * Exibe a mensagem de ajuda
         */
        onShowHelp: function() {
            MessageBox.information(
                "O arquivo deve estar no formato CSV com as seguintes colunas:\n\n" +
                "- NF_ID: Identificador da nota fiscal (10 dígitos numéricos)\n" +
                "- NUM_ITEM: Número do item (até 6 dígitos numéricos)\n\n" +
                "Exemplo de conteúdo do arquivo CSV:\n\n" +
                "NF_ID,NUM_ITEM\n" +
                "1234567890,123456\n" +
                "0987654321,654321\n\n" +
                "O separador pode ser vírgula (,) ou ponto-e-vírgula (;).",
                {
                    title: "Ajuda - Formato do Arquivo CSV"
                }
            );
        },
        
        /**
         * Lida com o erro de tipo de arquivo incorreto
         */
        handleTypeMissmatch: function(oEvent) {
            MessageBox.error("Apenas arquivos CSV são permitidos.");
        },
        
        /**
         * Processa o arquivo CSV quando selecionado
         */
        handleFileSelect: function(oEvent) {
            var oFileUploader = oEvent.getSource();
            var file = oEvent.getParameter("files") && oEvent.getParameter("files")[0];
            
            if (!file) {
                return;
            }
            
            // Atualiza o nome do arquivo no modelo
            var oModel = this.getView().getModel("csvModel");
            oModel.setProperty("/fileName", file.name);
            
            this._readCSVFile(file);
        },
        
        /**
         * Lê o arquivo CSV e valida seu conteúdo
         * @param {File} file - O arquivo CSV selecionado pelo usuário
         */
        _readCSVFile: function(file) {
            var that = this;
            var reader = new FileReader();
            
            reader.onload = function(e) {
                try {
                    var csvContent = e.target.result;
                    // Processar o conteúdo do CSV
                    var lines = csvContent.split(/\r\n|\n/);
                    
                    // Remove a primeira linha (cabeçalho) se existir
                    if (lines.length > 0) {
                        lines.shift();
                    }
                    
                    // Validação dos dados
                    var validData = [];
                    var hasErrors = false;
                    var errorLines = [];
                    
                    lines.forEach(function(line, index) {
                        if (line.trim() === "") {
                            return; // Pula linhas vazias
                        }
                        
                        // Divide a linha pelo separador CSV (normalmente vírgula, mas pode ser ponto e vírgula para pt-BR)
                        var columns = line.split(';');
                        
                        // Se não encontrar colunas com ponto e vírgula, tenta com vírgula
                        if (columns.length < 2) {
                            columns = line.split(',');
                        }
                        
                        if (columns.length >= 2) {
                            var col1 = columns[0].trim();
                            var col2 = columns[1].trim();
                            
                            // Validação da primeira coluna: deve ser numérica e ter 10 caracteres
                            var isCol1Valid = /^\d{10}$/.test(col1);
                            
                            // Validação da segunda coluna: deve ser numérica e ter no máximo 6 caracteres
                            var isCol2Valid = /^\d{1,6}$/.test(col2);
                            
                            if (isCol1Valid && isCol2Valid) {
                                // Formata a segunda coluna para ter 6 dígitos (preenchendo com zeros à esquerda)
                                var formattedCol2 = col2.padStart(6, '0');
                                
                                validData.push({
                                    nfId: col1,
                                    numItem: formattedCol2,
                                    vlOprSaida: "",
                                    vlrOprEntrada: "",
                                    vlItem: "",
                                    vlMerc: "",
                                    vlTotalDocumento: "",
                                    base: "",
                                    outrosBase: "",
                                    baseExcluida: ""
                                });
                            } else {
                                hasErrors = true;
                                errorLines.push("Linha " + (index + 2) + ": " + (isCol1Valid ? "" : "NF_ID inválido") + 
                                              (isCol2Valid ? "" : (isCol1Valid ? "" : " e ") + "NUM_ITEM inválido"));
                            }
                        }
                    });
                    
                    // Atualiza o modelo com os dados válidos
                    var oModel = that.getView().getModel("csvModel");
                    oModel.setProperty("/csvData", validData);
                    
                    if (hasErrors) {
                        // Usa MessageBox para erros de validação para que o usuário tenha tempo de ler
                        var errorMsg = "Algumas linhas contêm dados inválidos:\n" + errorLines.join("\n");
                        if (errorLines.length > 10) {
                            errorMsg = errorLines.slice(0, 10).join("\n") + "\n...(mais " + (errorLines.length - 10) + " linhas com erro)";
                        }
                        MessageBox.warning("Dados com problemas de formatação\n\n" + errorMsg);
                    } else if (validData.length === 0) {
                        MessageBox.warning("Nenhum dado válido encontrado no arquivo.");
                    } else {
                        // Usa MessageToast com duração maior para a mensagem de sucesso
                        MessageToast.show("Arquivo processado com sucesso. " + validData.length + " linhas válidas encontradas.", {
                            duration: 5000,  // 5 segundos (o padrão é 3 segundos)
                            width: "30em"    // Aumenta a largura para mensagens maiores
                        });
                    }
                } catch (error) {
                    MessageBox.error("Erro ao processar o arquivo: " + error.message);
                    console.error("Erro ao processar o arquivo CSV:", error);
                }
            };
            
            reader.onerror = function(event) {
                MessageBox.error("Erro ao ler o arquivo: " + (event.target.error ? event.target.error.name : "Erro desconhecido"));
            };
            
            // Lê o arquivo como texto (ideal para CSV)
            reader.readAsText(file);
        },
        
        /**
         * Processa os dados importados e aplica o ajuste decimal
         */
        onProcessar: function() {
            // Obter o valor do ajuste decimal e a opção selecionada (a mais / a menos)
            var oView = this.getView();
            var sAjusteDecimal = oView.byId("numericInput").getValue();
            var bAjusteAMais = oView.byId("rbMore").getSelected();
            var oModel = oView.getModel("csvModel");
            var aData = oModel.getProperty("/csvData");
            
            // Verificar se o valor do ajuste está no formato correto
            if (!/^[0-9]{1},[0-9]{2}$/.test(sAjusteDecimal)) {
                MessageBox.error("O valor do ajuste decimal deve estar no formato 0,00");
                return;
            }
            
            // Converter a string do ajuste para número (formato brasileiro: vírgula como separador decimal)
            var nAjuste = parseFloat(sAjusteDecimal.replace(",", "."));
            
            // Se a opção for "a menos", tornar o valor negativo
            if (!bAjusteAMais) {
                nAjuste = -nAjuste;
            }
            
            // Exibir mensagem de processamento
            MessageToast.show("Processando dados com ajuste " + 
                (bAjusteAMais ? "positivo" : "negativo") + 
                " de " + sAjusteDecimal, { duration: 2000 });
            
            // Mostrar um diálogo de carregamento
            var oDialog = new sap.m.BusyDialog({
                title: "Processando",
                text: "Obtendo dados complementares...",
                showCancelButton: false
            });
            
            oDialog.open();
            
            // Função para formatar um número com 2 casas decimais (formato brasileiro)
            var formatDecimal = function(value) {
                if (value === null || value === undefined || isNaN(value)) return "";
                // Formatar para texto com 2 casas decimais (formato brasileiro)
                return value.toFixed(2).replace(".", ",");
            };
            
            // Função para converter string numérica para número
            var parseDecimal = function(value) {
                if (typeof value !== 'string' || value.trim() === "") return 0;
                // Converte string com formato decimal (tanto padrão internacional quanto brasileiro) para número
                return parseFloat(value.replace(",", "."));
            };
            
            // Carregando os dados do mock
            this._loadMockData().then(function(mockData) {
                // Enriquecer os dados do CSV com os dados do mock JSON
                var enrichedData = aData.map(function(csvItem) {
                    // Procura no mock os dados correspondentes ao NF_ID e NUM_ITEM
                    var matchingItem = mockData.items.find(function(mockItem) {
                        return mockItem.nfId === csvItem.nfId && mockItem.numItem === csvItem.numItem;
                    });
                    
                    // Se encontrou dados correspondentes no mock, atualiza os campos
                    if (matchingItem) {
                        // Converter valores para números, aplicar o ajuste e converter de volta para texto
                        var vlOprSaida = parseDecimal(matchingItem.vlOprSaida) + nAjuste;
                        var vlrOprEntrada = parseDecimal(matchingItem.vlrOprEntrada) + nAjuste;
                        var vlItem = parseDecimal(matchingItem.vlItem) + nAjuste;
                        var vlMerc = parseDecimal(matchingItem.vlMerc) + nAjuste;
                        var vlTotalDocumento = parseDecimal(matchingItem.vlTotalDocumento) + nAjuste;
                        var base = parseDecimal(matchingItem.base) + nAjuste;
                        var outrosBase = parseDecimal(matchingItem.outrosBase) + nAjuste;
                        var baseExcluida = parseDecimal(matchingItem.baseExcluida) + nAjuste;
                        
                        return {
                            nfId: csvItem.nfId,
                            numItem: csvItem.numItem,
                            // Armazenar como strings formatadas no modelo
                            vlOprSaida: formatDecimal(vlOprSaida),
                            vlrOprEntrada: formatDecimal(vlrOprEntrada),
                            vlItem: formatDecimal(vlItem),
                            vlMerc: formatDecimal(vlMerc),
                            vlTotalDocumento: formatDecimal(vlTotalDocumento),
                            base: formatDecimal(base),
                            outrosBase: formatDecimal(outrosBase),
                            baseExcluida: formatDecimal(baseExcluida)
                        };
                    } else {
                        // Se não encontrou, mantém os campos vazios
                        return csvItem;
                    }
                });
                
                // Atualiza o modelo com os novos dados
                oModel.setProperty("/csvData", enrichedData);
                
                // Ativa o botão "Salvar"
                oModel.setProperty("/dadosProcessados", true);
                
                // Aplicar o ajuste nos valores conforme necessário (apenas simulação)
                var processedCount = 0;
                var notFoundCount = 0;
                
                enrichedData.forEach(function(item) {
                    if (item.vlOprSaida) {
                        processedCount++;
                    } else {
                        notFoundCount++;
                    }
                });
                
                // Fechar o diálogo de carregamento
                oDialog.close();
                
                // Exibir mensagem de sucesso com detalhes do processamento
                MessageBox.success(
                    "Processamento concluído com sucesso!\n\n" +
                    "Ajuste aplicado: " + (bAjusteAMais ? "+" : "-") + sAjusteDecimal + "\n" +
                    "Total de registros processados: " + processedCount + "\n" +
                    (notFoundCount > 0 ? "Registros não encontrados no banco de dados: " + notFoundCount : ""),
                    {
                        title: "Processamento Concluído"
                    }
                );
            }).catch(function(error) {
                // Fechar o diálogo de carregamento
                oDialog.close();
                
                // Exibir mensagem de erro
                MessageBox.error("Ocorreu um erro ao processar os dados: " + error);
            });
        },
        
        /**
         * Carrega os dados do arquivo mock JSON
         * @private
         * @returns {Promise} Promessa que resolve para os dados do mock
         */
        _loadMockData: function() {
            return new Promise(function(resolve, reject) {
                // Em um cenário real, aqui seria uma chamada para um serviço backend
                // Para o mock, carregamos diretamente o arquivo JSON local
                $.ajax({
                    url: "./model/mockData.json",
                    dataType: "json",
                    success: function(data) {
                        resolve(data);
                    },
                    error: function(xhr, status, error) {
                        reject("Erro ao carregar dados complementares: " + error);
                    }
                });
            });
        },
        
        /**
         * Exporta os dados processados para um arquivo Excel usando a API sap.ui.export.Spreadsheet
         */
        onExportToExcel: function() {
            var oView = this.getView();
            var oModel = oView.getModel("csvModel");
            var aData = oModel.getProperty("/csvData");
            
            // Verifica se há dados para exportar
            if (!aData || aData.length === 0) {
                MessageToast.show("Não há dados para exportar.");
                return;
            }
            
            // Mostra um diálogo de carregamento
            var oDialog = new sap.m.BusyDialog({
                title: "Exportando",
                text: "Gerando arquivo Excel...",
                showCancelButton: false
            });
            
            oDialog.open();
            
            try {
                // Define as colunas para a planilha
                var aColumns = [
                    {
                        label: "NF_ID",
                        property: "nfId",
                        type: EdmType.String
                    },
                    {
                        label: "NUM_ITEM",
                        property: "numItem",
                        type: EdmType.String
                    },
                    {
                        label: "VL_OPR_SAIDA",
                        property: "vlOprSaida",
                        type: EdmType.String
                    },
                    {
                        label: "VLR_OPR_ENTRADA",
                        property: "vlrOprEntrada",
                        type: EdmType.String
                    },
                    {
                        label: "VL_ITEM",
                        property: "vlItem",
                        type: EdmType.String
                    },
                    {
                        label: "VL_MERC",
                        property: "vlMerc",
                        type: EdmType.String
                    },
                    {
                        label: "VL_TOTAL_DOCUMENTO",
                        property: "vlTotalDocumento",
                        type: EdmType.String
                    },
                    {
                        label: "BASE",
                        property: "base",
                        type: EdmType.String
                    },
                    {
                        label: "OUTROS_BASE",
                        property: "outrosBase",
                        type: EdmType.String
                    },
                    {
                        label: "BASE_EXCLUIDA",
                        property: "baseExcluida",
                        type: EdmType.String
                    }
                ];
                
                // Define a configuração do Spreadsheet
                var oSettings = {
                    workbook: {
                        columns: aColumns,
                        context: {
                            sheetName: "Dados Ajustados",
                            title: "Dados Ajustados com Decimais"
                        }
                    },
                    dataSource: aData,
                    fileName: "dados_ajustados_" + this._getFormattedDate() + ".xlsx"
                };
                
                // Cria a planilha e exporta
                var oSpreadsheet = new Spreadsheet(oSettings);
                oSpreadsheet.build()
                    .then(function() {
                        // Fecha o diálogo de carregamento
                        oDialog.close();
                        MessageToast.show("Arquivo exportado com sucesso!", { duration: 3000 });
                    })
                    .catch(function(sMessage) {
                        // Fecha o diálogo de carregamento
                        oDialog.close();
                        MessageBox.error("Erro ao exportar o arquivo: " + sMessage);
                    })
                    .finally(function() {
                        oSpreadsheet.destroy();
                    });
                
            } catch (error) {
                // Fecha o diálogo em caso de erro
                oDialog.close();
                console.error("Erro ao exportar para Excel:", error);
                MessageBox.error("Erro ao exportar o arquivo: " + error.message);
            }
        },
        
        /**
         * Retorna a data atual formatada para uso no nome do arquivo
         * @private
         * @returns {string} Data formatada (YYYYMMDD_HHMM)
         */
        _getFormattedDate: function() {
            var now = new Date();
            return now.getFullYear() + 
                   ("0" + (now.getMonth() + 1)).slice(-2) + 
                   ("0" + now.getDate()).slice(-2) + 
                   "_" + 
                   ("0" + now.getHours()).slice(-2) + 
                   ("0" + now.getMinutes()).slice(-2);
        },
        
        /**
         * Salva os dados processados no banco de dados (simulação)
         */
        onSave: function() {
            var that = this;
            var oView = this.getView();
            var oModel = oView.getModel("csvModel");
            var aData = oModel.getProperty("/csvData");
            
            // Mostra um diálogo de carregamento durante o "salvamento"
            var oDialog = new sap.m.BusyDialog({
                title: "Salvando",
                text: "Salvando dados no banco...",
                showCancelButton: false
            });
            
            oDialog.open();
            
            // Simula uma operação assíncrona de salvamento no banco de dados
            setTimeout(function() {
                // Fecha o diálogo de carregamento
                oDialog.close();
                
                // Exibe um diálogo de sucesso com um botão para download
                var oSuccessDialog = new sap.m.Dialog({
                    title: "Salvamento Concluído",
                    type: "Message",
                    state: "Success",
                    content: [
                        new sap.m.VBox({
                            items: [
                                new sap.m.Text({
                                    text: "Os dados foram salvos com sucesso no banco de dados!"
                                }).addStyleClass("sapUiMediumMarginBottom"),
                                new sap.m.Text({
                                    text: "Total de registros salvos: " + aData.length
                                }),
                                new sap.m.Text({
                                    text: "Deseja fazer o download dos dados para referência?"
                                }).addStyleClass("sapUiMediumMarginTop")
                            ]
                        })
                    ],
                    beginButton: new sap.m.Button({
                        text: "Download Excel",
                        icon: "sap-icon://excel-attachment",
                        press: function() {
                            that.onExportToExcel();
                            oSuccessDialog.close();
                            that._resetApplication();
                        }
                    }),
                    endButton: new sap.m.Button({
                        text: "Fechar",
                        press: function() {
                            oSuccessDialog.close();
                            that._resetApplication();
                        }
                    }),
                    afterClose: function() {
                        oSuccessDialog.destroy();
                    }
                });
                
                oSuccessDialog.open();
                
            }, 2000); // Simula 2 segundos de processamento
        },
        
        /**
         * Limpa os dados e reinicia a aplicação para um novo processamento
         * @private
         */
        _resetApplication: function() {
            var oModel = this.getView().getModel("csvModel");
            
            // Limpa os dados do modelo
            oModel.setProperty("/csvData", []);
            oModel.setProperty("/fileName", "");
            oModel.setProperty("/dadosProcessados", false);
            
            // Limpa o campo de upload de arquivo
            var oFileUploader = this.byId("fileUploader");
            if (oFileUploader) {
                oFileUploader.clear();
            }
            
            MessageToast.show("Aplicação reiniciada. Você pode importar um novo arquivo.", {
                duration: 3000
            });
        }
    });
});